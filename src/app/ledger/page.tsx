import Link from "next/link";
import { RetryForm } from "@/components/RetryForm";
import { when } from "@/components/ui";
import { accountingAdapter } from "@/lib/accounting";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

type Bill = { id: number; invoice_id: number; external_ref: string; vendor_name: string; bill_number: string; bill_date: string; due_date: string; currency: string; total_cents: number; posted_at: string };
type SyncError = { id: number; invoice_id: number; adapter: string; reason: string; technical: string; at: string; vendor_name: string; invoice_number: string; total_cents: number; currency: string };

export default function LedgerPage() {
  const adapter = accountingAdapter();
  const errors = db()
    .prepare(
      `SELECT s.*, i.vendor_name, i.invoice_number, i.total_cents, i.currency FROM sync_errors s JOIN invoices i ON i.id = s.invoice_id
       WHERE s.resolved_at IS NULL ORDER BY s.id DESC`,
    )
    .all() as SyncError[];
  const bills = db().prepare("SELECT * FROM ledger_bills ORDER BY id DESC").all() as Bill[];
  const total = bills.reduce((a, b) => a + b.total_cents, 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ledger and errors</h1>
          <p>
            Bills posted to <strong>{adapter.label}</strong>. Only approved invoices that pass every check can get here.
          </p>
        </div>
      </div>

      <div className="card card-pad" data-testid="error-queue">
        <div className="section-title">
          <h2>Error queue</h2>
          <span className={`pill ${errors.length ? "pill-red" : "pill-green"}`}>{errors.length ? `${errors.length} waiting` : "All clear"}</span>
        </div>
        {errors.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nothing failed to post. If the accounting system ever refuses a bill, it waits here with the reason and a retry button. Nothing is lost.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>What went wrong</th>
                <th className="num">Amount</th>
                <th>Failed at</th>
                <th>Retry</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id} data-testid={`error-${e.invoice_id}`}>
                  <td>
                    <Link href={`/invoices/${e.invoice_id}`}>
                      <strong>{e.invoice_number}</strong>
                    </Link>
                    <div className="muted small">{e.vendor_name}</div>
                  </td>
                  <td style={{ maxWidth: 440 }}>
                    {e.reason}
                    <div className="muted small">Technical detail: {e.technical}</div>
                  </td>
                  <td className="num">{formatMoney(e.total_cents, e.currency)}</td>
                  <td className="small">{when(e.at)}</td>
                  <td>
                    <RetryForm id={e.invoice_id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card section" data-testid="ledger">
        <div className="card-pad" style={{ paddingBottom: 8 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            <h2>Posted bills</h2>
            <span className="muted small">
              {bills.length} bills, {formatMoney(total)}
            </span>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Vendor</th>
              <th>Supplier invoice</th>
              <th>Bill date</th>
              <th>Due</th>
              <th className="num">Total</th>
              <th>Posted</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b, i) => (
              <tr key={b.id} className={i === 0 ? "new-row" : ""} data-testid={`bill-${b.invoice_id}`}>
                <td>
                  <strong>{b.external_ref}</strong>
                </td>
                <td>{b.vendor_name}</td>
                <td>
                  <Link href={`/invoices/${b.invoice_id}`}>{b.bill_number}</Link>
                </td>
                <td>{b.bill_date}</td>
                <td>{b.due_date}</td>
                <td className="num">{formatMoney(b.total_cents, b.currency)}</td>
                <td className="small">{when(b.posted_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
