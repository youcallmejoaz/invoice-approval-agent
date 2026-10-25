/** Acceptance criteria from the build brief, run against the full seeded sample set in demo mode. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanup, flagCodes, manifest, row, seededDataDir } from "./helpers";
import { db } from "../src/lib/db";
import { getInvoice } from "../src/lib/repo";
import { approveInvoice, retryPosting } from "../src/lib/approvals";
import { FIELD_NAMES } from "../src/lib/schemas";

let dir: string;
beforeAll(async () => {
  dir = await seededDataDir();
});
afterAll(() => cleanup(dir));

const truths = manifest();
const DUP_CODES = ["duplicate_file", "duplicate_invoice_number", "possible_duplicate"];
const MATHS_CODES = ["line_amount_mismatch", "subtotal_mismatch", "tax_mismatch", "total_mismatch"];

describe("duplicates", () => {
  it("blocks the exact repeat and the re-sent copy, and flags the near duplicate", () => {
    const exact = truths.find((t) => t.scenario === "exact_duplicate")!;
    const resent = truths.find((t) => t.scenario === "resent_duplicate")!;
    const near = truths.find((t) => t.scenario === "near_duplicate")!;
    expect(row(exact.seq).status).toBe("blocked");
    expect(flagCodes(exact.seq)).toContain("duplicate_file");
    expect(row(resent.seq).status).toBe("blocked");
    expect(flagCodes(resent.seq)).toContain("duplicate_invoice_number");
    expect(row(near.seq).status).toBe("needs_review");
    expect(flagCodes(near.seq)).toContain("possible_duplicate");
    // each points at the invoice it duplicates
    expect(getInvoice(exact.seq)!.flags[0].relatedInvoiceId).toBe(12);
    expect(getInvoice(resent.seq)!.flags[0].relatedInvoiceId).toBe(18);
    expect(getInvoice(near.seq)!.flags.find((f) => f.code === "possible_duplicate")!.relatedInvoiceId).toBe(22);
  });

  it("does not flag any clean invoice as a duplicate", () => {
    const dupScenarios = ["exact_duplicate", "resent_duplicate", "near_duplicate"];
    const others = truths.filter((t) => !dupScenarios.includes(t.scenario));
    for (const t of others) expect(flagCodes(t.seq).filter((c) => DUP_CODES.includes(c)), t.file).toEqual([]);
    const blocked = db().prepare("SELECT COUNT(*) AS n FROM invoices WHERE status = 'blocked'").get() as { n: number };
    expect(blocked.n).toBe(2);
  });
});

describe("maths errors", () => {
  it("flags line items that do not add up to the subtotal, with the amounts", () => {
    const t = truths.find((x) => x.scenario === "maths_lines")!;
    const flag = getInvoice(t.seq)!.flags.find((f) => f.code === "subtotal_mismatch")!;
    expect(flag.severity).toBe("error");
    expect(flag.message).toContain("Line items add up to $1,150.00");
    expect(flag.message).toContain("subtotal says $1,250.00");
  });

  it("flags wrong tax with the correct figure", () => {
    const t = truths.find((x) => x.scenario === "maths_tax")!;
    const inv = getInvoice(t.seq)!;
    const flag = inv.flags.find((f) => f.code === "tax_mismatch")!;
    expect(flag.message).toBe("Tax should be $160.00 (8% of $2,000.00), but the invoice shows $180.00.");
    expect(inv.flags.filter((f) => f.severity === "error").map((f) => f.code)).toEqual(["tax_mismatch"]);
  });

  it("raises no maths flag on any other invoice", () => {
    for (const t of truths.filter((x) => !x.scenario.startsWith("maths"))) {
      expect(flagCodes(t.seq).filter((c) => MATHS_CODES.includes(c)), t.file).toEqual([]);
    }
  });
});

describe("approval routing", () => {
  it("routes every seeded invoice to its expected place", () => {
    for (const t of truths) {
      const r = row(t.seq);
      expect(r.route, t.file).toBe(t.expectedRoute);
      const expectedStatus = {
        auto: t.scenario === "ledger_fault" ? "post_failed" : "posted",
        review: "needs_review",
        manager: "awaiting_manager",
        blocked: "blocked",
      }[t.expectedRoute];
      expect(r.status, t.file).toBe(expectedStatus);
    }
  });

  it("gives the reason for every route", () => {
    for (const t of truths) {
      const inv = getInvoice(t.seq)!;
      expect(inv.reasons.length, t.file).toBeGreaterThan(0);
      for (const code of t.expectedFlags) {
        if (code === "over_limit") expect(inv.reasons.map((r) => r.ruleId)).toContain("over-limit");
        else expect(flagCodes(t.seq), t.file).toContain(code);
      }
    }
  });
});

describe("accounting sync", () => {
  it("puts a failed post in the error queue and a retry succeeds", async () => {
    const t = truths.find((x) => x.scenario === "ledger_fault")!;
    const err = db().prepare("SELECT * FROM sync_errors WHERE invoice_id = ?").get(t.seq) as { reason: string; resolved_at: string | null };
    expect(err.reason).toMatch(/did not respond in time/);
    expect(err.resolved_at).toBeNull();
    expect(db().prepare("SELECT * FROM ledger_bills WHERE invoice_id = ?").get(t.seq)).toBeUndefined();

    const result = await retryPosting(t.seq, "ap.clerk", "Accounting system is back online");
    expect(result.ok).toBe(true);
    expect(row(t.seq).status).toBe("posted");
    expect(db().prepare("SELECT * FROM ledger_bills WHERE invoice_id = ?").get(t.seq)).toBeTruthy();
    expect((db().prepare("SELECT resolved_at FROM sync_errors WHERE invoice_id = ?").get(t.seq) as { resolved_at: string }).resolved_at).toBeTruthy();
  });

  it("posts the over-limit invoice only after a finance manager approves it", async () => {
    const t = truths.find((x) => x.scenario === "over_limit")!;
    await expect(approveInvoice(t.seq, "ap.clerk", "Looks fine")).rejects.toThrow(/finance manager/);
    expect(row(t.seq).status).toBe("awaiting_manager");
    const r = await approveInvoice(t.seq, "finance.manager", "Laptops for the new starters, matches PO-3003");
    expect(r.ok).toBe(true);
    expect(row(t.seq).status).toBe("posted");
  });
});

describe("extraction in demo mode", () => {
  it("matches the ground truth for at least 35 of 40 invoices, and sends the rest to review", () => {
    let matched = 0;
    const unmatched: string[] = [];
    for (const t of truths) {
      const inv = getInvoice(t.seq)!;
      const ok =
        inv.vendor_name === t.vendorName &&
        inv.invoice_number === t.invoiceNumber &&
        inv.invoice_date === t.invoiceDate &&
        inv.due_date === t.dueDate &&
        inv.currency === t.currency &&
        inv.po_number === t.poNumber &&
        inv.subtotal_cents === t.subtotalCents &&
        inv.tax_cents === t.taxCents &&
        inv.total_cents === t.totalCents &&
        inv.lines.length === t.lines.length &&
        inv.lines.every((l, i) => l.amount_cents === t.lines[i].amountCents && l.quantity === t.lines[i].quantity);
      if (ok) matched++;
      else {
        unmatched.push(t.file);
        // Not guessed: an unmatched read is marked unclear and goes to a person.
        expect(inv.status, t.file).toBe("needs_review");
        expect(FIELD_NAMES.some((f) => inv.extraction!.sources[f].unclear), t.file).toBe(true);
        expect(flagCodes(t.seq)).toContain("low_confidence");
      }
    }
    expect(matched).toBeGreaterThanOrEqual(35);
    console.log(`Extraction matched ${matched}/40; sent to review: ${unmatched.join(", ") || "none"}`);
  });

  it("uses the bigger model only for the fields the fast model was unsure about", () => {
    const scan = getInvoice(truths.find((x) => x.scenario === "scan_recovered")!.seq)!;
    const rechecked = FIELD_NAMES.filter((f) => scan.extraction!.sources[f].model === "check");
    expect(rechecked.sort()).toEqual(["invoice_number", "line_items", "tax_rate", "total"].sort());
    expect(scan.invoice_number).toBe("CWF-6618");
    const clean = getInvoice(1)!;
    expect(FIELD_NAMES.every((f) => clean.extraction!.sources[f].model === "fast")).toBe(true);
  });
});
