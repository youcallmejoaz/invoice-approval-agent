import { db } from "./db";
import type { ExtractionResult, Flag, InvoiceStatus, Route } from "./schemas";
import type { Check } from "./validate";

export type VendorRow = { id: string; name: string; currency: string; tax_rate: number; payment_terms_days: number };

export type InvoiceRow = {
  id: number;
  file_name: string;
  file_path: string;
  file_hash: string;
  mime: string;
  source: string;
  received_at: string;
  processed_at: string | null;
  decided_at: string | null;
  status: InvoiceStatus;
  route: Route | null;
  route_reasons: string;
  vendor_name: string | null;
  vendor_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  po_number: string | null;
  subtotal_cents: number | null;
  tax_rate: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  extraction_json: string | null;
  flags_json: string;
  checks_json: string;
  duplicate_of: number | null;
  posted_ref: string | null;
};

export type LineRow = { line_no: number; description: string; quantity: number; unit_price_cents: number; amount_cents: number };

export type RouteReason = { ruleId: string; name: string; message: string };

export type Invoice = InvoiceRow & {
  flags: Flag[];
  checks: Check[];
  reasons: RouteReason[];
  extraction: ExtractionResult | null;
  lines: LineRow[];
};

export function hydrate(row: InvoiceRow): Invoice {
  return {
    ...row,
    flags: JSON.parse(row.flags_json || "[]"),
    checks: JSON.parse(row.checks_json || "[]"),
    reasons: JSON.parse(row.route_reasons || "[]"),
    extraction: row.extraction_json ? JSON.parse(row.extraction_json) : null,
    lines: db()
      .prepare("SELECT line_no, description, quantity, unit_price_cents, amount_cents FROM invoice_lines WHERE invoice_id = ? ORDER BY line_no")
      .all(row.id) as LineRow[],
  };
}

export function getInvoice(id: number): Invoice | null {
  const row = db().prepare("SELECT * FROM invoices WHERE id = ?").get(id) as InvoiceRow | undefined;
  return row ? hydrate(row) : null;
}

export function listInvoices(where = "1=1", params: unknown[] = []): Invoice[] {
  const rows = db().prepare(`SELECT * FROM invoices WHERE ${where} ORDER BY id`).all(...params) as InvoiceRow[];
  return rows.map(hydrate);
}

/** Normalises a vendor name so "Greenleaf Catering Co." and "GREENLEAF CATERING" match. */
export function vendorKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["inc", "llc", "ltd", "limited", "co", "company", "corp", "the"].includes(w))
    .join(" ");
}

export function findVendor(name: string | null): VendorRow | null {
  if (!name) return null;
  const key = vendorKey(name);
  const all = db().prepare("SELECT * FROM vendors").all() as VendorRow[];
  return all.find((v) => vendorKey(v.name) === key) ?? null;
}

export function getVendor(id: string): VendorRow | null {
  return (db().prepare("SELECT * FROM vendors WHERE id = ?").get(id) as VendorRow | undefined) ?? null;
}

export function invoiceLabel(inv: Pick<InvoiceRow, "id" | "invoice_number" | "file_name">): string {
  return inv.invoice_number ? `${inv.invoice_number} (#${inv.id})` : `#${inv.id} ${inv.file_name}`;
}
