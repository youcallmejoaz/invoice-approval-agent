import { logAudit } from "./audit";
import { db, nowIso } from "./db";
import { formatMoney, toCents } from "./money";
import { evaluateInvoice } from "./pipeline";
import { postInvoice } from "./posting";
import { getInvoice, type Invoice } from "./repo";
import { ACTORS, FIELD_LABELS, type ActorId, type FieldName } from "./schemas";

export class ActionError extends Error {}

function requireReason(reason: string | undefined | null): string {
  const r = (reason ?? "").trim();
  if (r.length < 3) throw new ActionError("A reason is required.");
  return r;
}

function requirePerson(actor: string): (typeof ACTORS)[ActorId] {
  const a = ACTORS[actor as ActorId];
  if (!a || a.role === "system") throw new ActionError("Only a person can do this.");
  return a;
}

function load(id: number): Invoice {
  const inv = getInvoice(id);
  if (!inv) throw new ActionError(`Invoice #${id} not found.`);
  return inv;
}

/** A person approves an invoice. Failed checks must be fixed first; manager-routed invoices need a manager. */
export async function approveInvoice(id: number, actor: string, reason: string) {
  const person = requirePerson(actor);
  const why = requireReason(reason);
  const inv = load(id);
  if (inv.status !== "needs_review" && inv.status !== "awaiting_manager") {
    throw new ActionError(`This invoice is "${inv.status}" and cannot be approved.`);
  }
  if (inv.route === "manager" && person.role !== "manager") {
    throw new ActionError("This invoice is over the approval limit. Only a finance manager can approve it.");
  }
  const errors = inv.flags.filter((f) => f.severity === "error");
  if (errors.length) {
    throw new ActionError(`Fix the failed checks first (correct a misread field, or reject the invoice): ${errors.map((e) => e.message).join(" ")}`);
  }
  if (!inv.vendor_id && inv.flags.some((f) => f.code === "new_vendor") && inv.vendor_name) {
    addVendorFromInvoice(inv, actor, why);
  }
  db().prepare("UPDATE invoices SET status = 'approved', decided_at = ? WHERE id = ?").run(nowIso(), id);
  logAudit({ invoiceId: id, actor, action: "approved", detail: `Approved by ${person.label} (${formatMoney(inv.total_cents, inv.currency ?? "USD")})`, reason: why });
  return postInvoice(id, actor);
}

/** Approving a new vendor's invoice is the person confirming the supplier, so it joins the vendor list. */
function addVendorFromInvoice(inv: Invoice, actor: string, reason: string) {
  const n = (db().prepare("SELECT COUNT(*) AS n FROM vendors").get() as { n: number }).n;
  const id = `V${String(n + 1).padStart(2, "0")}`;
  const terms = inv.invoice_date && inv.due_date ? Math.round((Date.parse(inv.due_date) - Date.parse(inv.invoice_date)) / 86400000) : 30;
  db()
    .prepare("INSERT INTO vendors (id, name, currency, tax_rate, payment_terms_days, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, inv.vendor_name, inv.currency ?? "USD", inv.tax_rate ?? 0, terms, nowIso());
  db().prepare("UPDATE invoices SET vendor_id = ? WHERE id = ?").run(id, inv.id);
  logAudit({ invoiceId: inv.id, actor, action: "vendor_added", detail: `${inv.vendor_name} added to the vendor list as ${id}`, reason });
}

export function rejectInvoice(id: number, actor: string, reason: string) {
  const person = requirePerson(actor);
  const why = requireReason(reason);
  const inv = load(id);
  if (inv.status === "posted" || inv.status === "rejected") throw new ActionError(`This invoice is already ${inv.status}.`);
  db().prepare("UPDATE invoices SET status = 'rejected', decided_at = ? WHERE id = ?").run(nowIso(), id);
  logAudit({ invoiceId: id, actor, action: "rejected", detail: `Rejected by ${person.label}`, reason: why });
}

export type EditableField = Exclude<FieldName, "line_items">;
export type Edits = Partial<Record<EditableField, string>> & { line_items?: string };

const MONEY_FIELDS: Partial<Record<EditableField, string>> = { subtotal: "subtotal_cents", tax: "tax_cents", total: "total_cents" };
const TEXT_FIELDS: Partial<Record<EditableField, string>> = {
  vendor_name: "vendor_name",
  invoice_number: "invoice_number",
  invoice_date: "invoice_date",
  due_date: "due_date",
  currency: "currency",
  po_number: "po_number",
};

/** Parses "description | quantity | unit price | amount", one line per row. */
export function parseLines(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((row, i) => {
      const [description, q, u, a] = row.split("|").map((x) => x.trim());
      const quantity = Number(q);
      const unit = toCents(u);
      const amount = toCents(a);
      if (!description || !Number.isFinite(quantity) || unit === null || amount === null) {
        throw new ActionError(`Line ${i + 1} should look like "description | quantity | unit price | amount".`);
      }
      return { description, quantity, unitPriceCents: unit, amountCents: amount };
    });
}

/**
 * A person corrects or confirms fields the AI misread. Every change is logged with the old and new value.
 * Submitting a field the AI was unsure about counts as the person confirming it against the file.
 * The invoice is then checked again and always needs a person's approval.
 */
export async function editInvoice(id: number, actor: string, edits: Edits, reason: string) {
  const person = requirePerson(actor);
  const why = requireReason(reason);
  const inv = load(id);
  if (["posted", "rejected", "blocked", "approved"].includes(inv.status)) throw new ActionError(`This invoice is ${inv.status} and cannot be edited.`);

  const changes: string[] = [];
  const confirmed: string[] = [];
  const result = inv.extraction;
  const sets: string[] = [];
  const params: unknown[] = [];
  const row = inv as unknown as Record<string, unknown>;

  for (const [field, raw] of Object.entries(edits) as [FieldName, string][]) {
    if (raw === undefined) continue;
    const value = raw.trim();
    let changed = false;
    if (field === "line_items") {
      const current = inv.lines.map((l) => `${l.description} | ${l.quantity} | ${l.unit_price_cents / 100} | ${l.amount_cents / 100}`).join("\n");
      const lines = parseLines(value);
      const next = lines.map((l) => `${l.description} | ${l.quantity} | ${l.unitPriceCents / 100} | ${l.amountCents / 100}`).join("\n");
      if (next !== current) {
        db().prepare("DELETE FROM invoice_lines WHERE invoice_id = ?").run(id);
        const ins = db().prepare("INSERT INTO invoice_lines (invoice_id, line_no, description, quantity, unit_price_cents, amount_cents) VALUES (?, ?, ?, ?, ?, ?)");
        lines.forEach((l, i) => ins.run(id, i + 1, l.description, l.quantity, l.unitPriceCents, l.amountCents));
        changes.push(`Line items: ${inv.lines.length} line(s) -> ${lines.length} line(s)`);
        changed = true;
      }
    } else if (MONEY_FIELDS[field]) {
      const col = MONEY_FIELDS[field]!;
      const cents = value === "" ? null : toCents(value);
      if (value !== "" && cents === null) throw new ActionError(`${FIELD_LABELS[field]} must be an amount.`);
      if (cents !== row[col]) {
        changes.push(`${FIELD_LABELS[field]}: ${formatMoney(row[col] as number | null, inv.currency ?? "USD")} -> ${formatMoney(cents, inv.currency ?? "USD")}`);
        sets.push(`${col} = ?`);
        params.push(cents);
        changed = true;
      }
    } else if (field === "tax_rate") {
      const rate = value === "" ? null : Number(value);
      if (rate !== null && !Number.isFinite(rate)) throw new ActionError("Tax rate must be a number.");
      if (rate !== inv.tax_rate) {
        changes.push(`Tax rate: ${inv.tax_rate ?? "-"}% -> ${rate ?? "-"}%`);
        sets.push("tax_rate = ?");
        params.push(rate);
        changed = true;
      }
    } else if (TEXT_FIELDS[field]) {
      const col = TEXT_FIELDS[field]!;
      if ((field === "invoice_date" || field === "due_date") && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new ActionError(`${FIELD_LABELS[field]} must be a date like 2026-10-25.`);
      }
      const next = value === "" ? null : field === "currency" ? value.toUpperCase() : value;
      if (next !== row[col]) {
        changes.push(`${FIELD_LABELS[field]}: ${row[col] ?? "-"} -> ${next ?? "-"}`);
        sets.push(`${col} = ?`);
        params.push(next);
        changed = true;
      }
    } else continue;

    if (result?.sources[field]) {
      if (result.sources[field].unclear && !changed) confirmed.push(FIELD_LABELS[field]);
      if (changed || result.sources[field].unclear) result.sources[field] = { ...result.sources[field], model: "person", unclear: false };
    }
  }

  if (!changes.length && !confirmed.length) throw new ActionError("Nothing was changed.");
  if (result) {
    sets.push("extraction_json = ?");
    params.push(JSON.stringify(result));
  }
  if (sets.length) db().prepare(`UPDATE invoices SET ${sets.join(", ")} WHERE id = ?`).run(...params, id);
  logAudit({
    invoiceId: id,
    actor,
    action: "edited",
    detail: [`Edited by ${person.label}`, ...changes, confirmed.length ? `Confirmed against the file: ${confirmed.join(", ")}` : ""].filter(Boolean).join("; "),
    reason: why,
  });
  await evaluateInvoice(id, { allowAuto: false, actor });
}

/** Sends a bill that failed to post to the accounting system again. */
export async function retryPosting(id: number, actor: string, reason: string) {
  requirePerson(actor);
  const why = requireReason(reason);
  const inv = load(id);
  if (inv.status !== "post_failed") throw new ActionError("Only bills that failed to post can be retried.");
  logAudit({ invoiceId: id, actor, action: "retry", detail: "Retry posting", reason: why });
  return postInvoice(id, actor);
}
