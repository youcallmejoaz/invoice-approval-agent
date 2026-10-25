import { db } from "./db";
import { formatMoney } from "./money";
import type { Flag } from "./schemas";
import { invoiceLabel, vendorKey, type InvoiceRow } from "./repo";

export const BLOCKING_DUPLICATE_CODES = ["duplicate_file", "duplicate_invoice_number"];

/** "INV-1043", "inv 1043" and "INV1043" are the same invoice number. */
export function normaliseInvoiceNumber(n: string): string {
  return n.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

export type DuplicateCheck = { flags: Flag[]; duplicateOf: number | null };

/**
 * Compares an invoice with the ones received before it.
 * Exact repeats (same file, or same vendor and invoice number) are blocked.
 * Likely repeats (same vendor, total within 1%, dated within 10 days) are flagged for a person.
 * Rejected invoices are ignored, so a corrected re-issue of a rejected invoice is not blocked.
 */
export function checkDuplicates(inv: InvoiceRow): DuplicateCheck {
  const earlier = db()
    .prepare("SELECT * FROM invoices WHERE id < ? AND status NOT IN ('rejected') ORDER BY id")
    .all(inv.id) as InvoiceRow[];
  const when = (r: InvoiceRow) =>
    new Date(r.received_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const sameFile = earlier.find((r) => r.file_hash === inv.file_hash);
  if (sameFile) {
    return {
      duplicateOf: sameFile.id,
      flags: [
        {
          code: "duplicate_file",
          severity: "error",
          message: `Exact duplicate: this is the same file as invoice ${invoiceLabel(sameFile)}, received ${when(sameFile)}. Blocked so it is not paid twice.`,
          relatedInvoiceId: sameFile.id,
        },
      ],
    };
  }

  const key = inv.vendor_id ?? (inv.vendor_name ? vendorKey(inv.vendor_name) : null);
  const sameVendor = (r: InvoiceRow) => key !== null && (r.vendor_id ?? (r.vendor_name ? vendorKey(r.vendor_name) : null)) === key;
  const others = earlier.filter((r) => r.status !== "blocked" && sameVendor(r));

  if (inv.invoice_number) {
    const num = normaliseInvoiceNumber(inv.invoice_number);
    const sameNumber = others.find((r) => r.invoice_number && normaliseInvoiceNumber(r.invoice_number) === num);
    if (sameNumber) {
      return {
        duplicateOf: sameNumber.id,
        flags: [
          {
            code: "duplicate_invoice_number",
            severity: "error",
            message: `Duplicate: ${inv.vendor_name} already sent invoice ${sameNumber.invoice_number} (#${sameNumber.id}, ${formatMoney(sameNumber.total_cents, sameNumber.currency ?? "USD")}), received ${when(sameNumber)}. This copy is a different file with the same invoice number. Blocked so it is not paid twice.`,
            relatedInvoiceId: sameNumber.id,
          },
        ],
      };
    }
  }

  if (inv.total_cents !== null && inv.invoice_date) {
    for (const r of others) {
      if (r.total_cents === null || !r.invoice_date) continue;
      const diff = Math.abs(r.total_cents - inv.total_cents);
      const pct = diff / Math.max(r.total_cents, inv.total_cents);
      const days = daysApart(r.invoice_date, inv.invoice_date);
      if (pct <= 0.01 && days <= 10) {
        return {
          duplicateOf: null,
          flags: [
            {
              code: "possible_duplicate",
              severity: "warning",
              message: `Possible duplicate of invoice ${invoiceLabel(r)}: same vendor, totals ${formatMoney(inv.total_cents, inv.currency ?? "USD")} and ${formatMoney(r.total_cents, r.currency ?? "USD")} (${(pct * 100).toFixed(1)}% apart), dated ${Math.round(days)} days apart. Check it is not the same work billed twice.`,
              relatedInvoiceId: r.id,
            },
          ],
        };
      }
    }
  }
  return { flags: [], duplicateOf: null };
}
