import { db } from "./db";
import { formatMoney, lineAmount, percentOf, sum } from "./money";
import { FIELD_LABELS, REQUIRED_FIELDS, type FieldName, type Flag } from "./schemas";
import type { VendorRow } from "./repo";

export type InvoiceData = {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  poNumber: string | null;
  subtotalCents: number | null;
  taxRate: number | null;
  taxCents: number | null;
  totalCents: number | null;
  lines: { description: string; quantity: number; unitPriceCents: number; amountCents: number }[] | null;
  /** Fields the AI could not read clearly. Maths that depends on them is skipped, not guessed. */
  unclear: { field: FieldName; confidence: number }[];
};

export type Check = { name: string; status: "pass" | "fail" | "skipped"; message: string };
export type ValidationResult = { flags: Flag[]; checks: Check[] };

const TOLERANCE = 1; // one cent, for rounding on the supplier's side

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function validateInvoice(d: InvoiceData, vendor: VendorRow | null): ValidationResult {
  const flags: Flag[] = [];
  const checks: Check[] = [];
  const unclear = new Set(d.unclear.map((u) => u.field));
  const money = (c: number) => formatMoney(c, d.currency || "USD");

  if (d.unclear.length) {
    flags.push({
      code: "low_confidence",
      severity: "error",
      message: `The AI was not sure about: ${d.unclear.map((u) => `${FIELD_LABELS[u.field]} (${Math.round(u.confidence * 100)}% sure)`).join(", ")}. A person needs to check these against the file.`,
    });
  }

  const values: Record<string, unknown> = {
    vendor_name: d.vendorName,
    invoice_number: d.invoiceNumber,
    invoice_date: d.invoiceDate,
    due_date: d.dueDate,
    currency: d.currency,
    subtotal: d.subtotalCents,
    tax: d.taxCents,
    total: d.totalCents,
    line_items: d.lines && d.lines.length ? d.lines : null,
  };
  const missing = REQUIRED_FIELDS.filter((f) => (values[f] === null || values[f] === undefined) && !unclear.has(f));
  if (missing.length) {
    flags.push({ code: "missing_field", severity: "error", message: `Missing on the invoice: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}.` });
  }

  const clear = (f: FieldName) => !unclear.has(f);

  // 1. Each line: quantity x unit price = amount
  if (d.lines && d.lines.length && clear("line_items")) {
    const bad = d.lines
      .map((l, i) => ({ l, i, expected: lineAmount(l.quantity, l.unitPriceCents) }))
      .filter(({ l, expected }) => Math.abs(expected - l.amountCents) > TOLERANCE);
    for (const { l, i, expected } of bad) {
      flags.push({
        code: "line_amount_mismatch",
        severity: "error",
        message: `Line ${i + 1} (${l.description}): ${l.quantity} x ${money(l.unitPriceCents)} is ${money(expected)}, but the invoice shows ${money(l.amountCents)}.`,
      });
    }
    checks.push(bad.length ? { name: "Line amounts", status: "fail", message: `${bad.length} line(s) do not multiply out` } : { name: "Line amounts", status: "pass", message: "Quantity x unit price matches every line" });
  } else checks.push({ name: "Line amounts", status: "skipped", message: "Line items not read clearly" });

  // 2. Line items add up to the subtotal
  if (d.lines && d.lines.length && d.subtotalCents !== null && clear("line_items") && clear("subtotal")) {
    const lineSum = sum(d.lines.map((l) => l.amountCents));
    if (Math.abs(lineSum - d.subtotalCents) > TOLERANCE) {
      flags.push({
        code: "subtotal_mismatch",
        severity: "error",
        message: `Line items add up to ${money(lineSum)}, but the subtotal says ${money(d.subtotalCents)} (${money(Math.abs(d.subtotalCents - lineSum))} difference).`,
      });
      checks.push({ name: "Line items = subtotal", status: "fail", message: `${money(lineSum)} vs ${money(d.subtotalCents)}` });
    } else checks.push({ name: "Line items = subtotal", status: "pass", message: `${money(lineSum)}` });
  } else checks.push({ name: "Line items = subtotal", status: "skipped", message: "Needs clear line items and subtotal" });

  // 3. Tax = rate x subtotal
  if (d.subtotalCents !== null && d.taxCents !== null && d.taxRate !== null && clear("subtotal") && clear("tax") && clear("tax_rate")) {
    const expected = percentOf(d.subtotalCents, d.taxRate);
    if (Math.abs(expected - d.taxCents) > TOLERANCE) {
      flags.push({
        code: "tax_mismatch",
        severity: "error",
        message: `Tax should be ${money(expected)} (${d.taxRate}% of ${money(d.subtotalCents)}), but the invoice shows ${money(d.taxCents)}.`,
      });
      checks.push({ name: "Tax maths", status: "fail", message: `expected ${money(expected)}, shows ${money(d.taxCents)}` });
    } else checks.push({ name: "Tax maths", status: "pass", message: `${d.taxRate}% of subtotal = ${money(d.taxCents)}` });
    if (vendor && Math.abs(vendor.tax_rate - d.taxRate) > 0.001) {
      flags.push({
        code: "tax_rate_changed",
        severity: "warning",
        message: `This vendor usually charges ${vendor.tax_rate}% tax, this invoice uses ${d.taxRate}%.`,
      });
    }
  } else checks.push({ name: "Tax maths", status: "skipped", message: "Needs clear subtotal, tax and tax rate" });

  // 4. Subtotal + tax = total
  if (d.subtotalCents !== null && d.taxCents !== null && d.totalCents !== null && clear("subtotal") && clear("tax") && clear("total")) {
    const expected = d.subtotalCents + d.taxCents;
    if (Math.abs(expected - d.totalCents) > TOLERANCE) {
      flags.push({
        code: "total_mismatch",
        severity: "error",
        message: `Subtotal plus tax is ${money(expected)}, but the total says ${money(d.totalCents)}.`,
      });
      checks.push({ name: "Total", status: "fail", message: `${money(expected)} vs ${money(d.totalCents)}` });
    } else checks.push({ name: "Total", status: "pass", message: `Subtotal + tax = ${money(d.totalCents)}` });
  } else checks.push({ name: "Total", status: "skipped", message: "Needs clear subtotal, tax and total" });

  // 5. Dates
  if (d.invoiceDate && d.dueDate && clear("invoice_date") && clear("due_date")) {
    if (d.dueDate < d.invoiceDate) {
      flags.push({ code: "due_before_invoice", severity: "error", message: `The due date (${d.dueDate}) is before the invoice date (${d.invoiceDate}).` });
      checks.push({ name: "Dates", status: "fail", message: "Due date before invoice date" });
    } else checks.push({ name: "Dates", status: "pass", message: "Due date is on or after the invoice date" });
  } else checks.push({ name: "Dates", status: "skipped", message: "Dates not read clearly" });

  // 6. Vendor
  if (d.vendorName && clear("vendor_name")) {
    if (!vendor) {
      flags.push({ code: "new_vendor", severity: "warning", message: `New vendor: "${d.vendorName}" is not in the vendor list. A person must confirm this supplier is real before paying.` });
      checks.push({ name: "Vendor", status: "fail", message: "Not in the vendor list" });
    } else {
      checks.push({ name: "Vendor", status: "pass", message: `Known vendor (${vendor.id})` });
      if (d.currency && clear("currency") && d.currency !== vendor.currency) {
        flags.push({ code: "currency_mismatch", severity: "error", message: `The invoice is in ${d.currency}, but this vendor bills in ${vendor.currency}.` });
      }
    }
  } else checks.push({ name: "Vendor", status: "skipped", message: "Vendor not read clearly" });

  // 7. Three-way match: invoice vs purchase order vs goods received
  if (d.poNumber && clear("po_number")) {
    const r = threeWayMatch(d, vendor, money);
    flags.push(...r.flags);
    checks.push(r.check);
  }

  return { flags, checks };
}

type PoLine = { line_no: number; description: string; quantity: number; unit_price_cents: number };

function threeWayMatch(d: InvoiceData, vendor: VendorRow | null, money: (c: number) => string): { flags: Flag[]; check: Check } {
  const flags: Flag[] = [];
  const po = db().prepare("SELECT * FROM purchase_orders WHERE po_number = ?").get(d.poNumber) as
    | { po_number: string; vendor_id: string }
    | undefined;
  const name = "3-way match (PO + goods received)";
  if (!po) {
    flags.push({ code: "po_not_found", severity: "error", message: `Purchase order ${d.poNumber} was not found.` });
    return { flags, check: { name, status: "fail", message: "PO not found" } };
  }
  if (vendor && po.vendor_id !== vendor.id) {
    flags.push({ code: "po_vendor_mismatch", severity: "error", message: `Purchase order ${d.poNumber} belongs to a different vendor.` });
  }
  const poLines = db().prepare("SELECT * FROM po_lines WHERE po_number = ? ORDER BY line_no").all(po.po_number) as PoLine[];
  const received = db()
    .prepare(
      `SELECT gl.description, SUM(gl.quantity_received) AS qty, MIN(g.grn_number) AS grn
       FROM goods_received g JOIN grn_lines gl ON gl.grn_number = g.grn_number
       WHERE g.po_number = ? GROUP BY gl.line_no, gl.description`,
    )
    .all(po.po_number) as { description: string; qty: number; grn: string }[];
  if (received.length === 0) {
    flags.push({ code: "goods_not_received", severity: "error", message: `No goods received note for ${d.poNumber} yet, so this cannot be paid.` });
  }
  for (const [i, line] of (d.lines ?? []).entries()) {
    const poLine = poLines.find((p) => norm(p.description) === norm(line.description)) ?? poLines[i];
    if (!poLine) {
      flags.push({ code: "po_line_missing", severity: "error", message: `Line "${line.description}" is not on ${d.poNumber}.` });
      continue;
    }
    if (poLine.unit_price_cents !== line.unitPriceCents) {
      flags.push({
        code: "po_price_mismatch",
        severity: "error",
        message: `"${line.description}" is billed at ${money(line.unitPriceCents)} each, but ${d.poNumber} agreed ${money(poLine.unit_price_cents)}.`,
      });
    }
    const rec = received.find((r) => norm(r.description) === norm(poLine.description));
    if (received.length && (!rec || line.quantity > rec.qty)) {
      flags.push({
        code: "quantity_over_received",
        severity: "error",
        message: `"${line.description}": invoiced ${line.quantity}, but only ${rec?.qty ?? 0} received.`,
      });
    }
  }
  // Compared before tax, so a tax error is reported once (by the tax check), not twice.
  const poSubtotal = sum(poLines.map((p) => lineAmount(p.quantity, p.unit_price_cents)));
  if (d.subtotalCents !== null && d.subtotalCents > poSubtotal + TOLERANCE) {
    flags.push({ code: "po_total_exceeded", severity: "error", message: `Subtotal ${money(d.subtotalCents)} is more than ${d.poNumber} allows before tax (${money(poSubtotal)}).` });
  }
  return {
    flags,
    check: flags.length
      ? { name, status: "fail", message: `${flags.length} problem(s) against ${d.poNumber}` }
      : { name, status: "pass", message: `Matches ${d.poNumber} and ${received[0]?.grn ?? "goods received"}` },
  };
}
