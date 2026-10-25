import fs from "node:fs";
import path from "node:path";
import { config, SAMPLES_DIR } from "./config";
import { db, useDb } from "./db";
import { buildEml, processInbox } from "./intake/inbox";
import { ingestFile, mimeFor } from "./pipeline";
import { loadDefaultRules } from "./rules";

type Manifest = {
  invoices: { seq: number; file: string; channel: "upload" | "email"; vendorName: string; invoiceNumber: string; invoiceDate: string }[];
  ledgerFaults: { billNumber: string; reason: string; technical: string; remaining: number }[];
};

export function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "manifest.json"), "utf8"));
}

/** Wipes the data folder and loads master data (vendors, POs, goods received, rules, demo ledger faults). */
export function resetAndLoadMasterData() {
  const cfg = config();
  for (const sub of ["files", "incoming", "inbox"]) fs.rmSync(path.join(cfg.dataDir, sub), { recursive: true, force: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(cfg.dbPath + suffix, { force: true });
  if (cfg.inboxDir !== path.join(cfg.dataDir, "inbox")) fs.rmSync(cfg.inboxDir, { recursive: true, force: true });
  useDb(cfg.dbPath);
  loadMasterData();
}

export function loadMasterData() {
  const now = new Date().toISOString();
  const vendors = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "master", "vendors.json"), "utf8")) as {
    id: string; name: string; currency: string; taxRate: number; paymentTermsDays: number;
  }[];
  const pos = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "master", "purchase_orders.json"), "utf8")) as {
    poNumber: string; vendorId: string; currency: string; totalCents: number;
    lines: { description: string; quantity: number; unitPriceCents: number }[];
    goodsReceived: { grnNumber: string; receivedAt: string; lines: { description: string; quantityReceived: number }[] };
  }[];
  const d = db();
  d.transaction(() => {
    const v = d.prepare("INSERT INTO vendors (id, name, currency, tax_rate, payment_terms_days, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    vendors.forEach((x) => v.run(x.id, x.name, x.currency, x.taxRate, x.paymentTermsDays, now));
    for (const p of pos) {
      d.prepare("INSERT INTO purchase_orders (po_number, vendor_id, currency, total_cents, created_at) VALUES (?, ?, ?, ?, ?)").run(p.poNumber, p.vendorId, p.currency, p.totalCents, now);
      p.lines.forEach((l, i) => d.prepare("INSERT INTO po_lines VALUES (?, ?, ?, ?, ?)").run(p.poNumber, i + 1, l.description, l.quantity, l.unitPriceCents));
      d.prepare("INSERT INTO goods_received VALUES (?, ?, ?)").run(p.goodsReceived.grnNumber, p.poNumber, p.goodsReceived.receivedAt);
      p.goodsReceived.lines.forEach((l, i) => d.prepare("INSERT INTO grn_lines VALUES (?, ?, ?, ?)").run(p.goodsReceived.grnNumber, i + 1, l.description, l.quantityReceived));
    }
    for (const f of readManifest().ledgerFaults) {
      d.prepare("INSERT INTO ledger_faults (bill_number, reason, technical, remaining) VALUES (?, ?, ?, ?)").run(f.billNumber, f.reason, f.technical, f.remaining);
    }
  })();
  loadDefaultRules();
}

/** Feeds the sample invoices through the real intake paths, in order: uploads directly, emails via the mock inbox. */
export async function processSamples(onEach?: (seq: number, file: string) => void) {
  const cfg = config();
  const { invoices } = readManifest();
  for (const inv of invoices) {
    const buffer = fs.readFileSync(path.join(SAMPLES_DIR, "invoices", inv.file));
    if (inv.channel === "email") {
      const eml = buildEml({
        fromName: `${inv.vendorName} Billing`,
        subject: `Invoice ${inv.invoiceNumber}`,
        text: `Please find invoice ${inv.invoiceNumber} attached.`,
        fileName: inv.file,
        mime: mimeFor(inv.file)!,
        content: buffer,
        date: new Date(inv.invoiceDate + "T09:00:00Z"),
      });
      fs.mkdirSync(cfg.inboxDir, { recursive: true });
      fs.writeFileSync(path.join(cfg.inboxDir, `${String(inv.seq).padStart(2, "0")}.eml`), eml);
      await processInbox(cfg.inboxDir);
    } else {
      await ingestFile({ buffer, fileName: inv.file, source: "upload" });
    }
    onEach?.(inv.seq, inv.file);
  }
}
