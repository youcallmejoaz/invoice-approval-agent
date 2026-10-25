import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { UploadZone } from "@/components/UploadZone";
import { Money, StatusPill, flagTitle } from "@/components/ui";
import { boardColumns } from "@/lib/dashboard";
import type { Invoice } from "@/lib/repo";

const COLUMNS = [
  { key: "review", title: "Needs review", cls: "col-review", empty: "Nothing waiting for a person." },
  { key: "auto", title: "Auto-approved", cls: "col-auto", empty: "Clean invoices under the limit land here." },
  { key: "approved", title: "Approved by a person", cls: "col-approved", empty: "Invoices a person approved." },
  { key: "blocked", title: "Blocked", cls: "col-blocked", empty: "Duplicates are stopped here." },
  { key: "errors", title: "Errors", cls: "col-errors", empty: "No posting errors." },
] as const;

function why(inv: Invoice): { text: string; cls: string } | null {
  const err = inv.flags.find((f) => f.severity === "error");
  const warn = inv.flags.find((f) => f.severity === "warning");
  if (inv.status === "post_failed") return { text: "Posting failed. Retry from the ledger page.", cls: "why-red" };
  if (inv.status === "awaiting_manager") return { text: inv.reasons.map((r) => r.name).join(", "), cls: "why-amber" };
  if (inv.status === "rejected") return { text: "Rejected by a person", cls: "why-amber" };
  if (err) return { text: flagTitle(err.code), cls: "why-red" };
  if (warn && inv.status !== "posted") return { text: flagTitle(warn.code), cls: "why-amber" };
  return null;
}

function Card({ inv }: { inv: Invoice }) {
  const w = why(inv);
  return (
    <Link href={`/invoices/${inv.id}`} className="inv-card" data-testid={`card-${inv.id}`}>
      <div className="inv-card-top">
        <span className="inv-vendor">{inv.vendor_name ?? inv.file_name}</span>
        <span className="inv-amount">
          <Money cents={inv.total_cents} currency={inv.currency} />
        </span>
      </div>
      <div className="inv-meta">
        <span>
          {inv.invoice_number ?? "No number"} {inv.source === "email" ? "· email" : inv.source === "folder" ? "· folder" : ""}
        </span>
        <StatusPill status={inv.status} />
      </div>
      {w ? <div className={`inv-why ${w.cls}`}>{w.text}</div> : null}
    </Link>
  );
}

export default function BoardPage() {
  const cols = boardColumns();
  const total = Object.values(cols).reduce((a, c) => a + c.length, 0);
  return (
    <>
      <AutoRefresh />
      <div className="page-head">
        <div>
          <h1>Invoices</h1>
          <p>Every invoice is read, checked and sorted. Only approved bills are posted to the accounting system.</p>
        </div>
        <span className="muted">{total} invoices</span>
      </div>
      <UploadZone />
      <div className="board" data-testid="board">
        {COLUMNS.map((c) => (
          <section key={c.key} className={`col ${c.cls}`} data-testid={`col-${c.key}`}>
            <div className="col-head">
              <h3>{c.title}</h3>
              <span className="col-count">{cols[c.key].length}</span>
            </div>
            {cols[c.key].length ? cols[c.key].map((inv) => <Card key={inv.id} inv={inv} />) : <div className="empty-col">{c.empty}</div>}
          </section>
        ))}
      </div>
    </>
  );
}
