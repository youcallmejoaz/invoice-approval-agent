import { db } from "../db";
import { PostingError, type AccountingAdapter } from "./types";

/**
 * Demo default. Bills land in the ledger_bills table (written by posting.ts).
 * Faults listed in ledger_faults fail a bill's next N posts, to demonstrate the error queue and retry.
 */
export const mockLedger: AccountingAdapter = {
  name: "mock",
  label: "Mock ledger",
  async postBill(bill) {
    const fault = db().prepare("SELECT * FROM ledger_faults WHERE bill_number = ? AND remaining > 0").get(bill.billNumber) as
      | { reason: string; technical: string }
      | undefined;
    if (fault) {
      db().prepare("UPDATE ledger_faults SET remaining = remaining - 1 WHERE bill_number = ?").run(bill.billNumber);
      throw new PostingError(fault.reason, fault.technical);
    }
    const n = (db().prepare("SELECT COUNT(*) AS n FROM ledger_bills").get() as { n: number }).n;
    return { externalRef: `BILL-${String(5001 + n)}`, request: bill };
  },
};
