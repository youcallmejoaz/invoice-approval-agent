import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanup, freshDataDir } from "./helpers";
import { formatMoney, lineAmount, percentOf, toCents } from "../src/lib/money";
import { validateInvoice, type InvoiceData } from "../src/lib/validate";
import { normaliseInvoiceNumber } from "../src/lib/duplicates";
import { decideRoute, listRules } from "../src/lib/rules";
import { mergeExtraction, lowConfidenceFields } from "../src/lib/extract/merge";
import { vendorKey, findVendor } from "../src/lib/repo";
import { toZohoBill } from "../src/lib/accounting/zoho";
import { toXeroBill } from "../src/lib/accounting/xero";
import { mockLedger } from "../src/lib/accounting/mock";
import { zohoBooks } from "../src/lib/accounting/zoho";
import { PostingError, type BillPayload } from "../src/lib/accounting/types";
import { parseLines } from "../src/lib/approvals";
import type { Extraction } from "../src/lib/schemas";

let dir: string;
beforeAll(() => {
  dir = freshDataDir();
});
afterAll(() => cleanup(dir));

const base: InvoiceData = {
  vendorName: "Northgate Office Supply",
  invoiceNumber: "NG-1",
  invoiceDate: "2026-10-01",
  dueDate: "2026-10-31",
  currency: "USD",
  poNumber: null,
  subtotalCents: 10000,
  taxRate: 8,
  taxCents: 800,
  totalCents: 10800,
  lines: [{ description: "Paper", quantity: 2, unitPriceCents: 5000, amountCents: 10000 }],
  unclear: [],
};
const codes = (d: Partial<InvoiceData>) => validateInvoice({ ...base, ...d }, findVendor(base.vendorName)).flags.map((f) => f.code);

describe("money", () => {
  it("converts and rounds in cents", () => {
    expect(toCents(1234.5)).toBe(123450);
    expect(toCents("$1,234.56")).toBe(123456);
    expect(toCents(null)).toBeNull();
    expect(percentOf(200000, 8)).toBe(16000);
    expect(percentOf(1, 50)).toBe(1);
    expect(lineAmount(1000, 42)).toBe(42000);
    expect(lineAmount(0.5, 333)).toBe(167);
    expect(formatMoney(123456)).toBe("$1,234.56");
  });
});

describe("validation", () => {
  it("passes a clean invoice", () => expect(codes({})).toEqual([]));
  it("catches a line that does not multiply out", () =>
    expect(codes({ lines: [{ description: "Paper", quantity: 2, unitPriceCents: 5000, amountCents: 9000 }], subtotalCents: 9000, taxCents: 720, totalCents: 9720 })).toContain("line_amount_mismatch"));
  it("catches subtotal, tax and total errors", () => {
    expect(codes({ subtotalCents: 11000, taxCents: 880, totalCents: 11880 })).toEqual(["subtotal_mismatch"]);
    expect(codes({ taxCents: 900, totalCents: 10900 })).toEqual(["tax_mismatch"]);
    expect(codes({ totalCents: 10900 })).toEqual(["total_mismatch"]);
  });
  it("allows one cent of rounding", () => expect(codes({ taxCents: 801, totalCents: 10801 })).toEqual([]));
  it("catches a due date before the invoice date", () => expect(codes({ dueDate: "2026-09-01" })).toContain("due_before_invoice"));
  it("flags a new vendor and a currency mismatch", () => {
    expect(validateInvoice({ ...base, vendorName: "Unknown Ltd" }, null).flags.map((f) => f.code)).toContain("new_vendor");
    expect(codes({ currency: "EUR" })).toContain("currency_mismatch");
  });
  it("skips maths on unclear fields instead of guessing", () => {
    const flags = codes({ totalCents: 99999, unclear: [{ field: "total", confidence: 0.4 }] });
    expect(flags).toContain("low_confidence");
    expect(flags).not.toContain("total_mismatch");
  });
  it("flags missing required fields", () => expect(codes({ invoiceNumber: null })).toContain("missing_field"));
  it("checks a PO against the order and goods received", () => {
    const vendor = findVendor("Summit IT Solutions");
    const lines = [
      { description: "Laptop docking station", quantity: 4, unitPriceCents: 18500, amountCents: 74000 },
      { description: "Network switch, 24 port", quantity: 1, unitPriceCents: 64000, amountCents: 64000 },
    ];
    const good: InvoiceData = {
      ...base,
      vendorName: "Summit IT Solutions",
      poNumber: "PO-3001",
      lines,
      subtotalCents: 138000,
      taxCents: 11040,
      totalCents: 149040,
    };
    expect(validateInvoice(good, vendor).flags).toEqual([]);
    const overPriced = { ...good, lines: [{ ...lines[0], unitPriceCents: 19500, amountCents: 78000 }, lines[1]], subtotalCents: 142000, taxCents: 11360, totalCents: 153360 };
    expect(validateInvoice(overPriced, vendor).flags.map((f) => f.code)).toEqual(expect.arrayContaining(["po_price_mismatch", "po_total_exceeded"]));
    const tooMany = { ...good, lines: [{ ...lines[0], quantity: 6, amountCents: 111000 }, lines[1]], subtotalCents: 175000, taxCents: 14000, totalCents: 189000 };
    expect(validateInvoice(tooMany, vendor).flags.map((f) => f.code)).toContain("quantity_over_received");
    expect(validateInvoice({ ...good, poNumber: "PO-9999" }, vendor).flags.map((f) => f.code)).toContain("po_not_found");
  });
});

describe("duplicates and vendors", () => {
  it("treats invoice number formatting as the same number", () => {
    expect(normaliseInvoiceNumber("inv-1043")).toBe(normaliseInvoiceNumber("INV 1043"));
  });
  it("matches vendor names loosely", () => {
    expect(vendorKey("Greenleaf Catering Co.")).toBe(vendorKey("GREENLEAF CATERING"));
    expect(findVendor("maple and pine print shop")?.id).toBe("V07");
  });
});

describe("routing rules", () => {
  const rules = () => listRules();
  it("auto-approves a clean invoice under the limit", () => expect(decideRoute({ flags: [], totalCents: 10000, vendorName: "x", currency: "USD" }, rules()).route).toBe("auto"));
  it("sends big invoices to a manager and keeps the strictest route", () => {
    const r = decideRoute({ flags: [{ code: "new_vendor", severity: "warning", message: "" }], totalCents: 900000, vendorName: "x", currency: "USD" }, rules());
    expect(r.route).toBe("manager");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["over-limit", "new-vendor"]);
  });
  it("blocks exact duplicates regardless of rules", () =>
    expect(decideRoute({ flags: [{ code: "duplicate_file", severity: "error", message: "dup" }], totalCents: 100, vendorName: "x", currency: "USD" }, []).route).toBe("blocked"));
  it("still sends failed checks and new vendors to a person if their rules are switched off", () => {
    const off = rules().map((r) => ({ ...r, enabled: false }));
    expect(decideRoute({ flags: [{ code: "tax_mismatch", severity: "error", message: "" }], totalCents: 100, vendorName: "x", currency: "USD" }, off).route).toBe("review");
    expect(decideRoute({ flags: [{ code: "new_vendor", severity: "warning", message: "" }], totalCents: 100, vendorName: "x", currency: "USD" }, off).route).toBe("review");
  });
});

describe("hybrid extraction merge", () => {
  const f = (value: unknown, confidence: number) => ({ value, confidence });
  const fast = {
    vendor_name: f("A", 0.99), invoice_number: f("1G", 0.5), invoice_date: f("2026-10-01", 0.99), due_date: f("2026-10-31", 0.99),
    currency: f("USD", 0.99), po_number: f(null, 0.95), subtotal: f(100, 0.99), tax_rate: f(0, 0.99), tax: f(0, 0.99), total: f(100, 0.6),
    line_items: f([], 0.99),
  } as unknown as Extraction;
  it("re-checks only low-confidence fields", () => expect(lowConfidenceFields(fast, 0.85)).toEqual(["invoice_number", "total"]));
  it("takes the re-check when it is more confident, and marks what is still unclear", () => {
    const { extraction, sources } = mergeExtraction(fast, { invoice_number: f("16", 0.95), total: f(100, 0.7) } as Partial<Extraction>, 0.85);
    expect(extraction.invoice_number.value).toBe("16");
    expect(sources.invoice_number).toMatchObject({ model: "check", unclear: false });
    expect(sources.total).toMatchObject({ model: "check", unclear: true });
    expect(sources.vendor_name).toMatchObject({ model: "fast", unclear: false });
  });
  it("keeps the first read if the re-check is less sure", () => {
    const { extraction, sources } = mergeExtraction(fast, { total: f(999, 0.3) } as Partial<Extraction>, 0.85);
    expect(extraction.total.value).toBe(100);
    expect(sources.total.model).toBe("fast");
  });
});

describe("accounting adapters", () => {
  const bill: BillPayload = {
    invoiceId: 1, vendorId: "V01", vendorName: "Northgate Office Supply", billNumber: "NG-1", billDate: "2026-10-01", dueDate: "2026-10-31",
    currency: "USD", poNumber: "PO-1", lines: [{ description: "Paper", quantity: 2, unitPriceCents: 5000, amountCents: 10000 }],
    subtotalCents: 10000, taxRate: 8, taxCents: 800, totalCents: 10800,
  };
  it("maps a bill to Zoho Books fields", () => {
    const z = toZohoBill(bill, { expenseAccountId: "acc1", taxId: "tax1", vendors: { V01: "zv1" } });
    expect(z).toMatchObject({ vendor_id: "zv1", bill_number: "NG-1", date: "2026-10-01", due_date: "2026-10-31", reference_number: "PO-1" });
    expect(z.line_items[0]).toEqual({ description: "Paper", quantity: 2, rate: 50, account_id: "acc1", tax_id: "tax1" });
  });
  it("maps a bill to a Xero ACCPAY invoice", () => {
    const x = toXeroBill(bill, { expenseAccountCode: "429", taxType: "INPUT", status: "AUTHORISED" });
    expect(x).toMatchObject({ Type: "ACCPAY", Contact: { Name: "Northgate Office Supply" }, InvoiceNumber: "NG-1", LineAmountTypes: "Exclusive" });
    expect(x.LineItems[0]).toMatchObject({ UnitAmount: 50, Quantity: 2, AccountCode: "429", TaxType: "INPUT" });
  });
  it("gives a plain-English reason when Zoho Books is not connected", async () => {
    delete process.env.ZOHO_ACCESS_TOKEN;
    await expect(zohoBooks.postBill(bill)).rejects.toThrow(PostingError);
    await expect(zohoBooks.postBill(bill)).rejects.toThrow(/not connected yet/);
  });
  it("mock ledger returns a bill reference", async () => expect((await mockLedger.postBill(bill)).externalRef).toMatch(/^BILL-\d+$/));
});

describe("line item editing", () => {
  it("parses lines typed by a person", () => {
    expect(parseLines("Freight | 1 | 1180 | 1180\nPallet wrap | 4 | 12.50 | 50")).toEqual([
      { description: "Freight", quantity: 1, unitPriceCents: 118000, amountCents: 118000 },
      { description: "Pallet wrap", quantity: 4, unitPriceCents: 1250, amountCents: 5000 },
    ]);
    expect(() => parseLines("bad line")).toThrow(/should look like/);
  });
});
