import { db, nowIso } from "./db";

export type AuditEntry = {
  id: number;
  invoice_id: number | null;
  at: string;
  actor: string;
  action: string;
  detail: string;
  reason: string | null;
};

export function logAudit(e: { invoiceId?: number | null; actor: string; action: string; detail?: string; reason?: string | null }) {
  db()
    .prepare("INSERT INTO audit_log (invoice_id, at, actor, action, detail, reason) VALUES (?, ?, ?, ?, ?, ?)")
    .run(e.invoiceId ?? null, nowIso(), e.actor, e.action, e.detail ?? "", e.reason ?? null);
}

export function auditFor(invoiceId: number): AuditEntry[] {
  return db().prepare("SELECT * FROM audit_log WHERE invoice_id = ? ORDER BY id").all(invoiceId) as AuditEntry[];
}

export function recentAudit(limit = 20): (AuditEntry & { file_name: string | null; invoice_number: string | null })[] {
  return db()
    .prepare(
      `SELECT a.*, i.file_name, i.invoice_number FROM audit_log a LEFT JOIN invoices i ON i.id = a.invoice_id
       ORDER BY a.id DESC LIMIT ?`,
    )
    .all(limit) as (AuditEntry & { file_name: string | null; invoice_number: string | null })[];
}
