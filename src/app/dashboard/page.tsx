import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { when } from "@/components/ui";
import { recentAudit } from "@/lib/audit";
import { dashboardMetrics, formatDuration } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { ACTORS, STATUS_LABELS, type ActorId, type InvoiceStatus } from "@/lib/schemas";

const COLOURS: Record<InvoiceStatus, string> = {
  posted: "var(--green)",
  approved: "var(--blue)",
  needs_review: "#d97706",
  awaiting_manager: "var(--violet)",
  blocked: "var(--red)",
  post_failed: "#ef4444",
  rejected: "#9ca3af",
};

export default function DashboardPage() {
  const m = dashboardMetrics();
  const byStatus = db().prepare("SELECT status, COUNT(*) AS n FROM invoices GROUP BY status ORDER BY n DESC").all() as { status: InvoiceStatus; n: number }[];
  const max = Math.max(1, ...byStatus.map((s) => s.n));
  const activity = recentAudit(14);
  return (
    <>
      <AutoRefresh ms={5000} />
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Today at a glance. Numbers come straight from the invoice log.</p>
        </div>
      </div>
      <div className="kpis" data-testid="kpis">
        <div className="card kpi">
          <div className="kpi-label">Processed today</div>
          <div className="kpi-value">{m.processedToday}</div>
          <div className="kpi-sub">{m.bySource.map((s) => `${s.n} by ${s.source}`).join(", ") || "none yet"}</div>
        </div>
        <div className="card kpi green">
          <div className="kpi-label">Auto-approved</div>
          <div className="kpi-value">{m.autoApproved}</div>
          <div className="kpi-sub">{m.processedToday ? Math.round((m.autoApproved / m.processedToday) * 100) : 0}% with no one touching them</div>
        </div>
        <div className="card kpi amber">
          <div className="kpi-label">Waiting for a person</div>
          <div className="kpi-value">{m.waiting}</div>
          <div className="kpi-sub">{m.waitingManager} need a finance manager</div>
        </div>
        <div className="card kpi red">
          <div className="kpi-label">Duplicates blocked</div>
          <div className="kpi-value">{m.blocked}</div>
          <div className="kpi-sub">
            <Link href="/blocked">See why</Link>
          </div>
        </div>
        <div className="card kpi red">
          <div className="kpi-label">Posting errors</div>
          <div className="kpi-value">{m.errors}</div>
          <div className="kpi-sub">
            <Link href="/ledger">Open the error queue</Link>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Average handling time</div>
          <div className="kpi-value">{formatDuration(m.avgMs)}</div>
          <div className="kpi-sub">received to decided, {m.handledCount} invoices{m.avgPeopleMs !== null ? `; ${formatDuration(m.avgPeopleMs)} when a person decides` : ""}</div>
        </div>
      </div>

      <div className="grid-2 section">
        <div className="card card-pad">
          <div className="section-title">
            <h2>Where every invoice is</h2>
            <span className="muted small">
              {m.posted} posted today, {formatMoney(m.postedValue)}
            </span>
          </div>
          {byStatus.map((s) => (
            <div key={s.status} className="bar-row">
              <span>{STATUS_LABELS[s.status]}</span>
              <div className="bar-track">
                <div style={{ width: `${(s.n / max) * 100}%`, background: COLOURS[s.status] }} />
              </div>
              <span className="mono" style={{ textAlign: "right", fontWeight: 650 }}>{s.n}</span>
            </div>
          ))}
        </div>
        <div className="card card-pad" data-testid="activity">
          <div className="section-title">
            <h2>Latest activity</h2>
            <span className="muted small">Full history is on each invoice</span>
          </div>
          <ul className="timeline">
            {activity.map((a) => (
              <li key={a.id}>
                <span className="when">{when(a.at)}</span>
                <div>
                  {a.invoice_id ? (
                    <Link href={`/invoices/${a.invoice_id}`} className="what">
                      {a.invoice_number ?? `#${a.invoice_id}`}
                    </Link>
                  ) : (
                    <span className="what">Rules</span>
                  )}
                  <span className="actor-chip">{ACTORS[a.actor as ActorId]?.label ?? a.actor}</span>
                  <div className="muted">{a.detail}</div>
                  {a.reason ? <div className="why">Reason: {a.reason}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
