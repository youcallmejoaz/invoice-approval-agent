import { config } from "../config";
import { mockLedger } from "./mock";
import type { AccountingAdapter } from "./types";
import { xero } from "./xero";
import { zohoBooks } from "./zoho";

export function accountingAdapter(): AccountingAdapter {
  switch (config().accountingAdapter) {
    case "zoho":
      return zohoBooks;
    case "xero":
      return xero;
    default:
      return mockLedger;
  }
}

export { PostingError } from "./types";
export type { AccountingAdapter, BillPayload } from "./types";
