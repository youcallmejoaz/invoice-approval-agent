import { db } from "./db";
import { listInvoices, type Invoice } from "./repo";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export function dashboardMetrics() {
  const since = startOfToday();
  const one = (sql: string, ...p: unknown[]) => (db().prepare(sql).get(...p) as { n: number | null }).n ?? 0;
  const processedToday = one("SELECT COUNT(*) AS n FROM invoices WHERE processed_at >= ?", since);
  const autoApproved = one(
    "SELECT COUNT(*) AS n FROM invoices WHERE route = 'auto' AND decided_at >= ? AND status IN ('approved','posted','post_failed')",
    since,
  );
  const waiting = one("SELECT COUNT(*) AS n FROM invoices WHERE status IN ('needs_review','awaiting_manager')");
  const waitingManager = one("SELECT COUNT(*) AS n FROM invoices WHERE status = 'awaiting_manager'");
  const blocked = one("SELECT COUNT(*) AS n FROM invoices WHERE status = 'blocked' AND decided_at >= ?", since);
  const errors = one("SELECT COUNT(*) AS n FROM sync_errors WHERE resolved_at IS NULL");
  const posted = one("SELECT COUNT(*) AS n FROM ledger_bills WHERE posted_at >= ?", since);
  const postedValue = one("SELECT SUM(total_cents) AS n FROM ledger_bills WHERE posted_at >= ?", since);
  const handled = db()
    .prepare("SELECT received_at, decided_at, route FROM invoices WHERE decided_at IS NOT NULL AND decided_at >= ? AND status != 'blocked'")
    .all(since) as { received_at: string; decided_at: string; route: string }[];
  const ms = handled.map((h) => Date.parse(h.decided_at) - Date.parse(h.received_at));
  const avgMs = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
  const people = handled.filter((h) => h.route !== "auto").map((h) => Date.parse(h.decided_at) - Date.parse(h.received_at));
  const avgPeopleMs = people.length ? people.reduce((a, b) => a + b, 0) / people.length : null;
  const bySource = db().prepare("SELECT source, COUNT(*) AS n FROM invoices WHERE received_at >= ? GROUP BY source").all(since) as { source: string; n: number }[];
  return { processedToday, autoApproved, waiting, waitingManager, blocked, errors, posted, postedValue, avgMs, avgPeopleMs, handledCount: handled.length, bySource };
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  const s = ms / 1000;
  if (s < 1) return "under 1s";
  if (s < 60) return `${Math.round(s)}s`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${Math.round(h / 24)} days`;
}

export function blockedToday(): Invoice[] {
  return listInvoices("status = 'blocked' AND decided_at >= ?", [startOfToday()]);
}

export type BoardColumns = Record<"review" | "auto" | "approved" | "blocked" | "errors", Invoice[]>;

export function boardColumns(): BoardColumns {
  const all = listInvoices().reverse();
  return {
    review: all.filter((i) => i.status === "needs_review" || i.status === "awaiting_manager"),
    auto: all.filter((i) => i.route === "auto" && (i.status === "posted" || i.status === "approved")),
    approved: all.filter((i) => i.route !== "auto" && (i.status === "posted" || i.status === "approved")),
    blocked: all.filter((i) => i.status === "blocked" || i.status === "rejected"),
    errors: all.filter((i) => i.status === "post_failed"),
  };
}
