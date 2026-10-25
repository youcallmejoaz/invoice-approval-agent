export type BillPayload = {
  invoiceId: number;
  vendorId: string;
  vendorName: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  currency: string;
  poNumber: string | null;
  lines: { description: string; quantity: number; unitPriceCents: number; amountCents: number }[];
  subtotalCents: number;
  taxRate: number;
  taxCents: number;
  totalCents: number;
};

export interface AccountingAdapter {
  name: "mock" | "zoho" | "xero";
  label: string;
  /** Creates the bill. Throws PostingError with a plain-English reason when it fails. */
  postBill(bill: BillPayload): Promise<{ externalRef: string; request: unknown }>;
}

/** A posting failure with a reason a finance person can act on, plus the technical detail for support. */
export class PostingError extends Error {
  constructor(
    public reason: string,
    public technical: string,
  ) {
    super(reason);
  }
}
