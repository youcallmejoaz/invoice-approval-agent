import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb, db } from "../src/lib/db";
import { processSamples, readManifest, resetAndLoadMasterData } from "../src/lib/seed";
import type { InvoiceRow } from "../src/lib/repo";

export type Truth = {
  seq: number;
  file: string;
  scenario: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  poNumber: string | null;
  taxRate: number;
  lines: { description: string; quantity: number; unitPriceCents: number; amountCents: number }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  expectedRoute: "auto" | "review" | "manager" | "blocked";
  expectedFlags: string[];
};

export function manifest(): Truth[] {
  return readManifest().invoices as unknown as Truth[];
}

/** Fresh data folder in the OS temp dir, demo mode on, master data loaded. */
export function freshDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "invoice-agent-test-"));
  process.env.DATA_DIR = dir;
  process.env.DEMO_MODE = "1";
  process.env.ACCOUNTING_ADAPTER = "mock";
  delete process.env.DB_PATH;
  delete process.env.INBOX_DIR;
  resetAndLoadMasterData();
  return dir;
}

export async function seededDataDir(): Promise<string> {
  const dir = freshDataDir();
  await processSamples();
  return dir;
}

export function cleanup(dir: string) {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Seeded invoices are inserted in manifest order, so invoice id === seq. */
export function row(seq: number): InvoiceRow {
  return db().prepare("SELECT * FROM invoices WHERE id = ?").get(seq) as InvoiceRow;
}

export function flagCodes(seq: number): string[] {
  return JSON.parse(row(seq).flags_json).map((f: { code: string }) => f.code);
}
