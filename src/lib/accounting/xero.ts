import fs from "node:fs";
import path from "node:path";
import { PostingError, type AccountingAdapter, type BillPayload } from "./types";

/**
 * Xero adapter (documented stub).
 *
 * API: PUT https://api.xero.com/api.xro/2.0/Invoices
 * Headers: "Authorization: Bearer {access token}", "Xero-tenant-id: {tenant}" (OAuth scope accounting.transactions)
 *
 * Field mapping (our bill -> Xero ACCPAY invoice, which Xero calls a bill):
 *   Type            = "ACCPAY"
 *   vendorName      -> Contact.Name     (Xero matches an existing contact by name)
 *   billNumber      -> InvoiceNumber    (for bills this is the supplier's invoice number)
 *   billDate        -> Date
 *   dueDate         -> DueDate
 *   currency        -> CurrencyCode
 *   poNumber        -> Reference
 *   lines[]         -> LineItems[]: Description, Quantity, UnitAmount, AccountCode, TaxType
 *   LineAmountTypes = "Exclusive" (our line amounts are before tax)
 *   Status          = from config (AUTHORISED or DRAFT)
 *
 * Untested against a live organisation: needs the client's credentials and a short mapping session.
 */
type XeroMap = { expenseAccountCode: string; taxType: string; status: string };

function loadMap(): XeroMap {
  const file = path.join(process.cwd(), "config", "accounting-map.json");
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { xero: XeroMap }).xero;
}

export function toXeroBill(bill: BillPayload, map: XeroMap) {
  return {
    Type: "ACCPAY",
    Contact: { Name: bill.vendorName },
    InvoiceNumber: bill.billNumber,
    Date: bill.billDate,
    DueDate: bill.dueDate,
    CurrencyCode: bill.currency,
    Reference: bill.poNumber ?? undefined,
    LineAmountTypes: "Exclusive",
    Status: map.status,
    LineItems: bill.lines.map((l) => ({
      Description: l.description,
      Quantity: l.quantity,
      UnitAmount: l.unitPriceCents / 100,
      AccountCode: map.expenseAccountCode,
      TaxType: bill.taxRate > 0 ? map.taxType : "NONE",
    })),
  };
}

export const xero: AccountingAdapter = {
  name: "xero",
  label: "Xero",
  async postBill(bill) {
    const tenant = process.env.XERO_TENANT_ID;
    const token = process.env.XERO_ACCESS_TOKEN;
    const body = toXeroBill(bill, loadMap());
    if (!tenant || !token) {
      throw new PostingError("Xero is not connected yet. Add the tenant ID and access token, then retry.", "XERO_TENANT_ID or XERO_ACCESS_TOKEN is not set");
    }
    const res = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Xero-tenant-id": tenant, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ Invoices: [body] }),
    }).catch((e: Error) => {
      throw new PostingError("Xero could not be reached. Nothing was posted. Retry in a few minutes.", e.message);
    });
    const json = (await res.json().catch(() => ({}))) as { Invoices?: { InvoiceID: string }[]; Message?: string };
    if (!res.ok || !json.Invoices?.[0]) {
      throw new PostingError(`Xero refused the bill: ${json.Message ?? res.statusText}.`, `HTTP ${res.status} ${JSON.stringify(json)}`);
    }
    return { externalRef: json.Invoices[0].InvoiceID, request: body };
  },
};
