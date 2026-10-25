import { FIELD_NAMES } from "./schemas";
import type { Invoice } from "./repo";
import type { InvoiceData } from "./validate";

/** The values validation runs on: what is stored now (including a person's corrections), plus which fields are still unclear. */
export function invoiceDataFrom(inv: Invoice): InvoiceData {
  const ex = inv.extraction;
  const unclear = ex
    ? FIELD_NAMES.filter((f) => ex.sources[f]?.unclear).map((f) => ({ field: f, confidence: ex.extraction[f].confidence }))
    : [];
  return {
    vendorName: inv.vendor_name,
    invoiceNumber: inv.invoice_number,
    invoiceDate: inv.invoice_date,
    dueDate: inv.due_date,
    currency: inv.currency,
    poNumber: inv.po_number,
    subtotalCents: inv.subtotal_cents,
    taxRate: inv.tax_rate,
    taxCents: inv.tax_cents,
    totalCents: inv.total_cents,
    lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unit_price_cents, amountCents: l.amount_cents })),
    unclear,
  };
}
