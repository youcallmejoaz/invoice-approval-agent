import Link from "next/link";
import { Money, when } from "@/components/ui";
import { blockedToday } from "@/lib/dashboard";

export default function BlockedPage() {
  const rows = blockedToday();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Blocked today</h1>
          <p>Every invoice stopped today and why. Blocked invoices are never posted.</p>
        </div>
        <span className="pill pill-red">{rows.length} blocked</span>
      </div>
      <div className="card" data-testid="blocked-list">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th className="num">Amount</th>
              <th>Why it was blocked</th>
              <th>Matches</th>
              <th>Blocked at</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">Nothing blocked today.</td>
              </tr>
            ) : (
              rows.map((inv) => (
                <tr key={inv.id} data-testid={`blocked-${inv.id}`}>
                  <td>
                    <Link href={`/invoices/${inv.id}`}>
                      <strong>{inv.vendor_name}</strong> {inv.invoice_number}
                    </Link>
                    <div className="muted small">{inv.file_name} · by {inv.source}</div>
                  </td>
                  <td className="num">
                    <Money cents={inv.total_cents} currency={inv.currency} />
                  </td>
                  <td style={{ maxWidth: 560 }}>{inv.flags.find((f) => f.code.startsWith("duplicate"))?.message ?? inv.reasons.map((r) => r.message).join(" ")}</td>
                  <td>{inv.duplicate_of ? <Link href={`/invoices/${inv.duplicate_of}`}>Original #{inv.duplicate_of}</Link> : "-"}</td>
                  <td className="small">{when(inv.decided_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
