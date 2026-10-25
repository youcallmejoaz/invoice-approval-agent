import fs from "node:fs";
import path from "node:path";
import { PostingError, type AccountingAdapter, type BillPayload } from "./types";

/**
 * Zoho Books adapter (documented stub).
 *
 * API: POST {ZOHO_API_DOMAIN}/books/v3/bills?organization_id={ZOHO_ORGANIZATION_ID}
 * Auth header: "Authorization: Zoho-oauthtoken {access token}" (OAuth scope ZohoBooks.bills.CREATE)
 *
 * Field mapping (our bill -> Zoho Books bill):
 *   vendorId      -> vendor_id         (via config/accounting-map.json zoho.vendors, Zoho's own vendor ID)
 *   billNumber    -> bill_number       (the supplier's invoice number)
 *   billDate      -> date              (YYYY-MM-DD)
 *   dueDate       -> due_date          (YYYY-MM-DD)
 *   currency      -> currency_code     (only needed when the org is multi-currency)
 *   poNumber      -> reference_number
 *   lines[]       -> line_items[]: description, quantity, rate (unit price), account_id, tax_id
 *   taxCents      -> taxes are calculated by Zoho from tax_id; we compare its total with ours after posting
 *
 * Untested against a live organisation: needs the client's credentials and a short mapping session.
 */
type ZohoMap = { expenseAccountId: string; taxId: string; vendors: Record<string, string> };

function loadMap(): ZohoMap {
  const file = path.join(process.cwd(), "config", "accounting-map.json");
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { zoho: ZohoMap }).zoho;
}

export function toZohoBill(bill: BillPayload, map: ZohoMap) {
  return {
    vendor_id: map.vendors[bill.vendorId] || null,
    bill_number: bill.billNumber,
    date: bill.billDate,
    due_date: bill.dueDate,
    currency_code: bill.currency,
    reference_number: bill.poNumber ?? undefined,
    line_items: bill.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      rate: l.unitPriceCents / 100,
      account_id: map.expenseAccountId || undefined,
      tax_id: bill.taxRate > 0 ? map.taxId || undefined : undefined,
    })),
  };
}

export const zohoBooks: AccountingAdapter = {
  name: "zoho",
  label: "Zoho Books",
  async postBill(bill) {
    const org = process.env.ZOHO_ORGANIZATION_ID;
    const token = process.env.ZOHO_ACCESS_TOKEN;
    const domain = process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.com";
    const body = toZohoBill(bill, loadMap());
    if (!org || !token) {
      throw new PostingError(
        "Zoho Books is not connected yet. Add the organisation ID and access token, then retry.",
        "ZOHO_ORGANIZATION_ID or ZOHO_ACCESS_TOKEN is not set",
      );
    }
    if (!body.vendor_id) {
      throw new PostingError(
        `${bill.vendorName} is not linked to a Zoho Books vendor yet. Add it to the vendor mapping, then retry.`,
        `config/accounting-map.json zoho.vendors.${bill.vendorId} is empty`,
      );
    }
    const res = await fetch(`${domain}/books/v3/bills?organization_id=${encodeURIComponent(org)}`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((e: Error) => {
      throw new PostingError("Zoho Books could not be reached. Nothing was posted. Retry in a few minutes.", e.message);
    });
    const json = (await res.json().catch(() => ({}))) as { code?: number; message?: string; bill?: { bill_id: string } };
    if (!res.ok || json.code !== 0 || !json.bill) {
      throw new PostingError(`Zoho Books refused the bill: ${json.message ?? res.statusText}.`, `HTTP ${res.status} ${JSON.stringify(json)}`);
    }
    return { externalRef: json.bill.bill_id, request: body };
  },
};
