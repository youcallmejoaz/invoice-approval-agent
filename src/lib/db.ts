import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate REAL NOT NULL DEFAULT 0,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  po_number TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  currency TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS po_lines (
  po_number TEXT NOT NULL REFERENCES purchase_orders(po_number),
  line_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  PRIMARY KEY (po_number, line_no)
);
CREATE TABLE IF NOT EXISTS goods_received (
  grn_number TEXT PRIMARY KEY,
  po_number TEXT NOT NULL REFERENCES purchase_orders(po_number),
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS grn_lines (
  grn_number TEXT NOT NULL REFERENCES goods_received(grn_number),
  line_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity_received REAL NOT NULL,
  PRIMARY KEY (grn_number, line_no)
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  mime TEXT NOT NULL,
  source TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  decided_at TEXT,
  status TEXT NOT NULL,
  route TEXT,
  route_reasons TEXT NOT NULL DEFAULT '[]',
  vendor_name TEXT,
  vendor_id TEXT,
  invoice_number TEXT,
  invoice_date TEXT,
  due_date TEXT,
  currency TEXT,
  po_number TEXT,
  subtotal_cents INTEGER,
  tax_rate REAL,
  tax_cents INTEGER,
  total_cents INTEGER,
  extraction_json TEXT,
  flags_json TEXT NOT NULL DEFAULT '[]',
  checks_json TEXT NOT NULL DEFAULT '[]',
  duplicate_of INTEGER REFERENCES invoices(id),
  posted_ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoices_hash ON invoices(file_hash);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_id, invoice_number);
CREATE TABLE IF NOT EXISTS invoice_lines (
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  PRIMARY KEY (invoice_id, line_no)
);
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  params_json TEXT NOT NULL DEFAULT '{}',
  route TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_invoice ON audit_log(invoice_id);
CREATE TABLE IF NOT EXISTS ledger_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL UNIQUE REFERENCES invoices(id),
  external_ref TEXT NOT NULL,
  adapter TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  bill_number TEXT NOT NULL,
  bill_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  posted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  adapter TEXT NOT NULL,
  reason TEXT NOT NULL,
  technical TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS ledger_faults (
  bill_number TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  technical TEXT NOT NULL,
  remaining INTEGER NOT NULL
);
`;

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (!instance) instance = openDb(config().dbPath);
  return instance;
}

export function openDb(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new Database(file);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  d.pragma("busy_timeout = 5000");
  d.exec(SCHEMA);
  return d;
}

/** Point the app at a different database (tests use ":memory:"). */
export function useDb(file: string): Database.Database {
  if (instance) instance.close();
  instance = openDb(file);
  return instance;
}

export function closeDb() {
  if (instance) instance.close();
  instance = null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function tx<T>(fn: () => T): T {
  return db().transaction(fn)();
}
