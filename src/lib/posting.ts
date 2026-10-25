import { accountingAdapter, PostingError, type BillPayload } from "./accounting";
import { auditFor, logAudit } from "./audit";
import { db, nowIso } from "./db";
import { BLOCKING_DUPLICATE_CODES, checkDuplicates } from "./duplicates";
import { formatMoney } from "./money";
import { ACTORS, type ActorId } from "./schemas";
import { getInvoice, getVendor, type Invoice } from "./repo";
import { invoiceDataFrom } from "./invoice-data";
import { validateInvoice } from "./validate";

/** Thrown when something tries to post an invoice that has not earned it. */
export class GuardrailError extends Error {}

/**
 * The last line of defence before money leaves: re-checks in code, from the stored data, that the invoice
 * is approved, passes validation now, is not a duplicate, and was approved by someone allowed to approve it.
 */
export function assertPostable(inv: Invoice): void {
  if (inv.status !== "approved" && inv.status !== "post_failed") {
    throw new GuardrailError(`Invoice #${inv.id} is "${inv.status}", not approved. Nothing was posted.`);
  }
  const existing = db().prepare("SELECT id FROM ledger_bills WHERE invoice_id = ?").get(inv.id);
  if (existing) throw new GuardrailError(`Invoice #${inv.id} is already posted.`);
  if (!inv.vendor_id) throw new GuardrailError(`Invoice #${inv.id} has no confirmed vendor.`);

  const vendor = getVendor(inv.vendor_id);
  const fresh = validateInvoice(invoiceDataFrom(inv), vendor);
  const errors = fresh.flags.filter((f) => f.severity === "error");
  if (errors.length) throw new GuardrailError(`Invoice #${inv.id} fails validation: ${errors.map((e) => e.message).join(" ")}`);

  const dup = checkDuplicates(inv).flags.find((f) => BLOCKING_DUPLICATE_CODES.includes(f.code));
  if (dup) throw new GuardrailError(`Invoice #${inv.id} is a duplicate: ${dup.message}`);

  const approval = [...auditFor(inv.id)].reverse().find((a) => a.action === "approved");
  if (!approval) throw new GuardrailError(`Invoice #${inv.id} has no recorded approval.`);
  if (approval.actor === "system" && inv.route !== "auto") {
    throw new GuardrailError(`Invoice #${inv.id} needs a person's approval; it cannot be auto-approved.`);
  }
  if (approval.actor !== "system" && !approval.reason) throw new GuardrailError(`Invoice #${inv.id} approval has no reason.`);
  if (inv.route === "manager" && ACTORS[approval.actor as ActorId]?.role !== "manager") {
    throw new GuardrailError(`Invoice #${inv.id} needs a finance manager's approval.`);
  }
}

export function billFrom(inv: Invoice): BillPayload {
  return {
    invoiceId: inv.id,
    vendorId: inv.vendor_id!,
    vendorName: inv.vendor_name!,
    billNumber: inv.invoice_number!,
    billDate: inv.invoice_date!,
    dueDate: inv.due_date!,
    currency: inv.currency!,
    poNumber: inv.po_number,
    lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unit_price_cents, amountCents: l.amount_cents })),
    subtotalCents: inv.subtotal_cents!,
    taxRate: inv.tax_rate ?? 0,
    taxCents: inv.tax_cents!,
    totalCents: inv.total_cents!,
  };
}

/** Posts an approved invoice as a bill. Failures go to the error queue with a plain-English reason. */
export async function postInvoice(id: number, actor: string): Promise<{ ok: true; ref: string } | { ok: false; reason: string }> {
  const inv = getInvoice(id);
  if (!inv) throw new GuardrailError(`Invoice #${id} not found.`);
  assertPostable(inv);
  const adapter = accountingAdapter();
  const bill = billFrom(inv);
  try {
    const { externalRef, request } = await adapter.postBill(bill);
    const at = nowIso();
    db().transaction(() => {
      db()
        .prepare(
          `INSERT INTO ledger_bills (invoice_id, external_ref, adapter, vendor_name, bill_number, bill_date, due_date, currency, total_cents, payload_json, posted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, externalRef, adapter.name, bill.vendorName, bill.billNumber, bill.billDate, bill.dueDate, bill.currency, bill.totalCents, JSON.stringify(request), at);
      db().prepare("UPDATE invoices SET status = 'posted', posted_ref = ? WHERE id = ?").run(externalRef, id);
      db().prepare("UPDATE sync_errors SET resolved_at = ? WHERE invoice_id = ? AND resolved_at IS NULL").run(at, id);
      logAudit({ invoiceId: id, actor, action: "posted", detail: `Posted to ${adapter.label} as ${externalRef} (${formatMoney(bill.totalCents, bill.currency)})` });
    })();
    return { ok: true, ref: externalRef };
  } catch (e) {
    const err = e instanceof PostingError ? e : new PostingError("The accounting system returned an unexpected error. Nothing was posted. Retry, or contact support if it keeps failing.", String(e));
    db().transaction(() => {
      db().prepare("UPDATE invoices SET status = 'post_failed' WHERE id = ?").run(id);
      db()
        .prepare("INSERT INTO sync_errors (invoice_id, adapter, reason, technical, at) VALUES (?, ?, ?, ?, ?)")
        .run(id, adapter.name, err.reason, err.technical, nowIso());
      logAudit({ invoiceId: id, actor, action: "post_failed", detail: `${adapter.label}: ${err.reason}` });
    })();
    return { ok: false, reason: err.reason };
  }
}
