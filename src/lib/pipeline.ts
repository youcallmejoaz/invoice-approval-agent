import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logAudit } from "./audit";
import { config } from "./config";
import { db, nowIso } from "./db";
import { checkDuplicates } from "./duplicates";
import { extractInvoice } from "./extract";
import { invoiceDataFrom } from "./invoice-data";
import { formatMoney, toCents } from "./money";
import { postInvoice } from "./posting";
import { findVendor, getInvoice, type Invoice, type InvoiceRow } from "./repo";
import { decideRoute } from "./rules";
import { FIELD_LABELS, type ExtractionResult, type Flag } from "./schemas";
import { validateInvoice } from "./validate";

export type Source = "upload" | "folder" | "email";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function mimeFor(fileName: string): string | null {
  return MIME[path.extname(fileName).toLowerCase()] ?? null;
}

const SOURCE_LABEL: Record<Source, string> = { upload: "upload", folder: "watched folder", email: "email" };
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Stores a file, reads it, checks it and routes it. Auto-approved invoices are posted straight away. */
export async function ingestFile(opts: { buffer: Buffer; fileName: string; source: Source; from?: string }): Promise<Invoice> {
  const cfg = config();
  const mime = mimeFor(opts.fileName);
  if (!mime) throw new Error(`"${opts.fileName}" is not a PDF or image, so it was not accepted.`);

  const sha256 = crypto.createHash("sha256").update(opts.buffer).digest("hex");
  fs.mkdirSync(cfg.filesDir, { recursive: true });
  const stored = path.join(cfg.filesDir, `${sha256}${path.extname(opts.fileName).toLowerCase()}`);
  if (!fs.existsSync(stored)) fs.writeFileSync(stored, opts.buffer);

  const { lastInsertRowid } = db()
    .prepare(
      `INSERT INTO invoices (file_name, file_path, file_hash, mime, source, received_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'needs_review')`,
    )
    .run(opts.fileName, stored, sha256, mime, opts.source, nowIso());
  const id = Number(lastInsertRowid);
  logAudit({ invoiceId: id, actor: "system", action: "received", detail: `Received by ${SOURCE_LABEL[opts.source]}${opts.from ? ` from ${opts.from}` : ""}: ${opts.fileName}` });

  let extraFlags: Flag[] = [];
  try {
    const result = await extractInvoice({ path: stored, mime, sha256 });
    saveExtraction(id, result);
    const rechecked = Object.values(result.sources).filter((s) => s.model === "check").length;
    const unclear = Object.entries(result.sources).filter(([, s]) => s.unclear).map(([f]) => FIELD_LABELS[f as keyof typeof FIELD_LABELS]);
    logAudit({
      invoiceId: id,
      actor: "system",
      action: "extracted",
      detail: [
        result.modelsUsed.length ? `Read by ${result.modelsUsed[0]}` : "No AI read available",
        rechecked ? `${rechecked} field(s) re-checked by ${result.modelsUsed[1]}` : "",
        unclear.length ? `still unclear: ${unclear.join(", ")}` : "",
        result.note ?? "",
      ]
        .filter(Boolean)
        .join("; "),
    });
  } catch (e) {
    extraFlags = [{ code: "extraction_failed", severity: "error", message: `The AI could not read this file: ${(e as Error).message}` }];
    logAudit({ invoiceId: id, actor: "system", action: "extraction_failed", detail: (e as Error).message });
  }

  await evaluateInvoice(id, { allowAuto: true, extraFlags });
  return getInvoice(id)!;
}

function saveExtraction(id: number, result: ExtractionResult) {
  const e = result.extraction;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  db().transaction(() => {
    db()
      .prepare(
        `UPDATE invoices SET vendor_name = ?, invoice_number = ?, invoice_date = ?, due_date = ?, currency = ?, po_number = ?,
         subtotal_cents = ?, tax_rate = ?, tax_cents = ?, total_cents = ?, extraction_json = ? WHERE id = ?`,
      )
      .run(
        str(e.vendor_name.value),
        str(e.invoice_number.value),
        isDate(e.invoice_date.value) ? e.invoice_date.value : null,
        isDate(e.due_date.value) ? e.due_date.value : null,
        str(e.currency.value)?.toUpperCase() ?? null,
        str(e.po_number.value),
        toCents(e.subtotal.value),
        e.tax_rate.value,
        toCents(e.tax.value),
        toCents(e.total.value),
        JSON.stringify(result),
        id,
      );
    db().prepare("DELETE FROM invoice_lines WHERE invoice_id = ?").run(id);
    const insert = db().prepare(
      "INSERT INTO invoice_lines (invoice_id, line_no, description, quantity, unit_price_cents, amount_cents) VALUES (?, ?, ?, ?, ?, ?)",
    );
    (e.line_items.value ?? []).forEach((l, i) => insert.run(id, i + 1, l.description, l.quantity, toCents(l.unit_price) ?? 0, toCents(l.amount) ?? 0));
  })();
}

/**
 * Runs validation, duplicate checks and the routing rules, then sets the status.
 * allowAuto is true only for a fresh invoice; after a person edits it, it always needs a person's approval.
 */
export async function evaluateInvoice(id: number, opts: { allowAuto: boolean; extraFlags?: Flag[]; actor?: string }) {
  const inv = getInvoice(id)!;
  const vendor = findVendor(inv.vendor_name);
  db().prepare("UPDATE invoices SET vendor_id = ? WHERE id = ?").run(vendor?.id ?? null, id);
  const fresh = getInvoice(id)!;

  const { flags: checkFlags, checks } = validateInvoice(invoiceDataFrom(fresh), vendor);
  const dup = checkDuplicates(fresh as InvoiceRow);
  const flags = [...dup.flags, ...(opts.extraFlags ?? []), ...checkFlags];

  let { route, reasons } = decideRoute({ flags, totalCents: fresh.total_cents, vendorName: fresh.vendor_name, currency: fresh.currency });
  if (route === "auto" && !opts.allowAuto) {
    route = "review";
    reasons = [{ ruleId: "edited", name: "Edited by a person", message: "Every check passes now. A person changed the data, so a person approves it." }];
  }

  const status = route === "blocked" ? "blocked" : route === "manager" ? "awaiting_manager" : route === "review" ? "needs_review" : "approved";
  const now = nowIso();
  db()
    .prepare(
      `UPDATE invoices SET status = ?, route = ?, route_reasons = ?, flags_json = ?, checks_json = ?, duplicate_of = ?,
       processed_at = COALESCE(processed_at, ?), decided_at = ? WHERE id = ?`,
    )
    .run(status, route, JSON.stringify(reasons), JSON.stringify(flags), JSON.stringify(checks), dup.duplicateOf, now, route === "blocked" || route === "auto" ? now : null, id);

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const where = { blocked: "Blocked", manager: "Sent to a finance manager", review: "Sent for review", auto: "Auto-approved" }[route];
  logAudit({
    invoiceId: id,
    actor: opts.actor ?? "system",
    action: route === "blocked" ? "blocked" : "checked",
    detail: `${passed} check(s) passed, ${failed} failed${flags.length ? `; flags: ${flags.map((f) => f.code).join(", ")}` : ""}. ${route === "auto" ? where : `${where}: ${reasons.map((r) => r.name).join(", ")}`}.`,
  });

  if (route === "auto") {
    logAudit({ invoiceId: id, actor: "system", action: "approved", detail: `Auto-approved: ${reasons[0].message} Total ${formatMoney(fresh.total_cents, fresh.currency ?? "USD")}.` });
    await postInvoice(id, "system");
  }
}
