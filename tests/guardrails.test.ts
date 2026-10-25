/** Guardrails: nothing posts without passing validation and approval rules; every human change needs a reason and is logged. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cleanup, row, seededDataDir } from "./helpers";
import { db } from "../src/lib/db";
import { auditFor } from "../src/lib/audit";
import { approveInvoice, editInvoice, rejectInvoice } from "../src/lib/approvals";
import { assertPostable, GuardrailError, postInvoice } from "../src/lib/posting";
import { getInvoice } from "../src/lib/repo";
import { addRule } from "../src/lib/rules";
import { ingestFile } from "../src/lib/pipeline";
import { SAMPLES_DIR } from "../src/lib/config";

let dir: string;
beforeAll(async () => {
  dir = await seededDataDir();
});
afterAll(() => cleanup(dir));

const ledgerCount = () => (db().prepare("SELECT COUNT(*) AS n FROM ledger_bills").get() as { n: number }).n;

describe("posting guard", () => {
  it("refuses to post invoices that are waiting for a person", async () => {
    const before = ledgerCount();
    for (const id of [20, 25, 27, 33, 36]) await expect(postInvoice(id, "system")).rejects.toThrow(GuardrailError);
    expect(ledgerCount()).toBe(before);
  });

  it("refuses to post blocked duplicates", async () => {
    await expect(postInvoice(31, "system")).rejects.toThrow(GuardrailError);
    await expect(postInvoice(34, "system")).rejects.toThrow(GuardrailError);
  });

  it("refuses an invoice forced to 'approved' that fails validation (maths error)", () => {
    db().prepare("UPDATE invoices SET status = 'approved' WHERE id = 25").run();
    expect(() => assertPostable(getInvoice(25)!)).toThrow(/fails validation/);
    db().prepare("UPDATE invoices SET status = 'needs_review' WHERE id = 25").run();
  });

  it("refuses an invoice forced to 'approved' with no recorded approval", () => {
    db().prepare("UPDATE invoices SET status = 'approved' WHERE id = 36").run();
    expect(() => assertPostable(getInvoice(36)!)).toThrow(/no recorded approval/);
    db().prepare("UPDATE invoices SET status = 'needs_review' WHERE id = 36").run();
  });

  it("refuses an exact duplicate even if its status is forced to 'approved'", () => {
    db().prepare("UPDATE invoices SET status = 'approved' WHERE id = 31").run();
    expect(() => assertPostable(getInvoice(31)!)).toThrow(GuardrailError);
    db().prepare("UPDATE invoices SET status = 'blocked' WHERE id = 31").run();
  });

  it("never posts the same invoice twice", async () => {
    await expect(postInvoice(1, "system")).rejects.toThrow(/not approved|already posted/);
  });
});

describe("people's decisions", () => {
  it("requires a reason to approve, reject or edit", async () => {
    await expect(approveInvoice(36, "ap.clerk", "")).rejects.toThrow(/reason/);
    expect(() => rejectInvoice(36, "ap.clerk", "  ")).toThrow(/reason/);
    await expect(editInvoice(33, "ap.clerk", { total: "1230" }, "")).rejects.toThrow(/reason/);
  });

  it("will not approve an invoice with failed checks", async () => {
    await expect(approveInvoice(25, "finance.manager", "Approve anyway")).rejects.toThrow(/Fix the failed checks/);
    await expect(approveInvoice(33, "finance.manager", "Approve anyway")).rejects.toThrow(/Fix the failed checks/);
    expect(row(25).status).toBe("needs_review");
  });

  it("lets a person correct a misread field, then still needs a person's approval", async () => {
    await editInvoice(33, "ap.clerk", { total: "1230.00" }, "Total hidden by a stain; checked the subtotal and line items");
    const inv = getInvoice(33)!;
    expect(inv.total_cents).toBe(123000);
    expect(inv.flags.filter((f) => f.severity === "error")).toEqual([]);
    expect(inv.status).toBe("needs_review");
    expect(inv.reasons[0].ruleId).toBe("edited");
    const edit = auditFor(33).find((a) => a.action === "edited")!;
    expect(edit.actor).toBe("ap.clerk");
    expect(edit.reason).toMatch(/stain/);
    expect(edit.detail).toContain("Total: $1,280.00 -> $1,230.00");
    const result = await approveInvoice(33, "ap.clerk", "Matches the delivery note");
    expect(result.ok).toBe(true);
    expect(row(33).status).toBe("posted");
  });

  it("adds a new vendor to the vendor list when a person approves its invoice", async () => {
    await approveInvoice(27, "ap.clerk", "Confirmed new marketing supplier with the office manager");
    expect(row(27).status).toBe("posted");
    expect(db().prepare("SELECT * FROM vendors WHERE name = 'Redwood Marketing Studio'").get()).toBeTruthy();
    expect(auditFor(27).map((a) => a.action)).toEqual(expect.arrayContaining(["vendor_added", "approved", "posted"]));
  });

  it("logs who did what, when and why", () => {
    rejectInvoice(25, "finance.manager", "Subtotal does not match line items; asked supplier for a corrected invoice");
    const entry = auditFor(25).at(-1)!;
    expect(entry).toMatchObject({ actor: "finance.manager", action: "rejected" });
    expect(entry.reason).toMatch(/corrected invoice/);
    expect(Date.parse(entry.at)).not.toBeNaN();
  });

  it("does not let the system act as a person", async () => {
    await expect(approveInvoice(36, "system", "auto")).rejects.toThrow(/Only a person/);
  });
});

describe("rules are data", () => {
  it("a new rule sends new vendors to a finance manager", async () => {
    addRule({ name: "New vendor needs manager", kind: "new_vendor", route: "manager", priority: 15, description: "Any new vendor always needs a manager's approval." }, "finance.manager", "Fraud control");
    const buffer = fs.readFileSync(path.join(SAMPLES_DIR, "invoices", "27-redwood-marketing-studio-RMS-0042.pdf"));
    db().prepare("DELETE FROM vendors WHERE name = 'Redwood Marketing Studio'").run();
    db().prepare("UPDATE invoices SET status = 'rejected' WHERE id = 27").run(); // so the re-upload is not a duplicate
    const inv = await ingestFile({ buffer, fileName: "redwood-again.pdf", source: "upload" });
    expect(inv.status).toBe("awaiting_manager");
    expect(inv.reasons.map((r) => r.name)).toContain("New vendor needs manager");
    await expect(approveInvoice(inv.id, "ap.clerk", "Supplier confirmed")).rejects.toThrow(/finance manager/);
  });

  it("requires a reason to change rules", () => {
    expect(() => addRule({ name: "x rule", kind: "new_vendor", route: "manager" }, "finance.manager", "")).toThrow(/reason/);
  });
});

describe("demo mode with an unknown file", () => {
  it("sends it to review without guessing any field", async () => {
    const inv = await ingestFile({ buffer: Buffer.from("%PDF-1.4 not a sample"), fileName: "unknown.pdf", source: "upload" });
    expect(inv.status).toBe("needs_review");
    expect(inv.total_cents).toBeNull();
    expect(inv.flags.map((f) => f.code)).toContain("low_confidence");
  });

  it("rejects files that are not PDFs or images", async () => {
    await expect(ingestFile({ buffer: Buffer.from("hello"), fileName: "notes.txt", source: "upload" })).rejects.toThrow(/not a PDF or image/);
  });
});
