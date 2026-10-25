import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionPanel } from "@/components/DecisionPanel";
import { PdfViewer } from "@/components/PdfViewer";
import { RetryForm } from "@/components/RetryForm";
import { ConfidenceBar, FlagList, Money, StatusPill, modelName, when } from "@/components/ui";
import { currentActor } from "@/lib/actor";
import { auditFor } from "@/lib/audit";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getInvoice } from "@/lib/repo";
import { ACTORS, FIELD_LABELS, FIELD_NAMES, type ActorId, type FieldName } from "@/lib/schemas";

const ACTION_LABELS: Record<string, string> = {
  received: "Received",
  extracted: "Read by AI",
  extraction_failed: "Could not be read",
  checked: "Checked and routed",
  blocked: "Blocked",
  approved: "Approved",
  rejected: "Rejected",
  edited: "Corrected",
  posted: "Posted to accounting",
  post_failed: "Posting failed",
  retry: "Retry requested",
  vendor_added: "Vendor added",
};

function displayValue(inv: NonNullable<ReturnType<typeof getInvoice>>, f: FieldName): string {
  switch (f) {
    case "vendor_name": return inv.vendor_name ?? "-";
    case "invoice_number": return inv.invoice_number ?? "-";
    case "invoice_date": return inv.invoice_date ?? "-";
    case "due_date": return inv.due_date ?? "-";
    case "currency": return inv.currency ?? "-";
    case "po_number": return inv.po_number ?? "None";
    case "subtotal": return formatMoney(inv.subtotal_cents, inv.currency ?? "USD");
    case "tax_rate": return inv.tax_rate === null ? "-" : `${inv.tax_rate}%`;
    case "tax": return formatMoney(inv.tax_cents, inv.currency ?? "USD");
    case "total": return formatMoney(inv.total_cents, inv.currency ?? "USD");
    case "line_items": return `${inv.lines.length} line(s), below`;
  }
}

function editValue(inv: NonNullable<ReturnType<typeof getInvoice>>, f: FieldName): string {
  const c = (v: number | null) => (v === null ? "" : (v / 100).toFixed(2));
  switch (f) {
    case "subtotal": return c(inv.subtotal_cents);
    case "tax": return c(inv.tax_cents);
    case "total": return c(inv.total_cents);
    case "tax_rate": return inv.tax_rate === null ? "" : String(inv.tax_rate);
    case "po_number": return inv.po_number ?? "";
    default: return (inv[f as keyof typeof inv] as string | null) ?? "";
  }
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = getInvoice(Number(id));
  if (!inv) notFound();
  const actor = await currentActor();
  const threshold = config().confidenceThreshold;
  const audit = auditFor(inv.id);
  const ex = inv.extraction;
  const syncError = db().prepare("SELECT * FROM sync_errors WHERE invoice_id = ? AND resolved_at IS NULL ORDER BY id DESC").get(inv.id) as { reason: string } | undefined;
  const open = inv.status === "needs_review" || inv.status === "awaiting_manager";
  const errors = inv.flags.filter((f) => f.severity === "error");
  const reasonCls = inv.status === "blocked" || inv.status === "post_failed" ? "red" : open ? "amber" : "";
  const fastModel = ex?.modelsUsed[0] ?? "fast model";
  const checkModel = ex?.modelsUsed[1] ?? "check model";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted small">
            <Link href="/">Invoices</Link> / #{inv.id} · {inv.file_name}
          </div>
          <h1 style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12 }}>
            {inv.vendor_name ?? "Unknown vendor"} <span className="muted" style={{ fontWeight: 500 }}>{inv.invoice_number}</span>
            <StatusPill status={inv.status} />
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted small">Total</div>
          <div style={{ fontSize: 28, fontWeight: 750 }}>
            <Money cents={inv.total_cents} currency={inv.currency} />
          </div>
        </div>
      </div>

      <div className="detail">
        <div className="viewer" data-testid="viewer">
          <PdfViewer src={`/api/files/${inv.id}`} mime={inv.mime} />
        </div>

        <div>
          <div className={`reason-box ${reasonCls}`} data-testid="route-reasons">
            <strong>{inv.status === "posted" ? `Posted as ${inv.posted_ref}. ` : ""}Why it is here: </strong>
            {inv.status === "blocked" ? "Blocked as a duplicate. It will never be posted. Details below." : inv.reasons.map((r) => r.message).join(" ")}
          </div>

          {syncError ? (
            <div className="card card-pad section">
              <h3>Posting failed</h3>
              <p style={{ margin: "6px 0 12px" }}>{syncError.reason}</p>
              <RetryForm id={inv.id} />
            </div>
          ) : null}

          {inv.flags.length ? (
            <div className="section" data-testid="flags">
              <FlagList flags={inv.flags} />
            </div>
          ) : null}

          {open ? (
            <div className="card card-pad section">
              <div className="section-title">
                <h2>Decision</h2>
                <span className="muted small">Acting as {actor.label}</span>
              </div>
              <DecisionPanel
                id={inv.id}
                canApprove={errors.length === 0}
                approveBlockedReason={errors.length ? "Approval is locked until the failed checks are fixed. Correct a misread field, or reject the invoice and ask the supplier for a corrected one." : null}
                needsManager={inv.route === "manager"}
                actorIsManager={actor.role === "manager"}
                editable
                fields={FIELD_NAMES.filter((f) => f !== "line_items").map((f) => ({
                  name: f,
                  label: FIELD_LABELS[f],
                  value: editValue(inv, f),
                  unclear: !!ex?.sources[f]?.unclear,
                }))}
                linesText={inv.lines.map((l) => `${l.description} | ${l.quantity} | ${(l.unit_price_cents / 100).toFixed(2)} | ${(l.amount_cents / 100).toFixed(2)}`).join("\n")}
              />
            </div>
          ) : null}

          <div className="card section" data-testid="fields">
            <div className="card-pad" style={{ paddingBottom: 8 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                <h2>What the AI read</h2>
                <span className="muted small">{ex?.note ?? ""}</span>
              </div>
            </div>
            <table className="kv">
              <tbody>
                {FIELD_NAMES.map((f) => {
                  const src = ex?.sources[f];
                  const conf = ex?.extraction[f].confidence ?? 0;
                  return (
                    <tr key={f} className={src?.unclear ? "unclear" : ""} data-testid={`field-${f}`}>
                      <th>{FIELD_LABELS[f]}</th>
                      <td className="value">{displayValue(inv, f)}</td>
                      <td style={{ width: 190 }}>
                        {src?.model === "person" ? <span className="muted small">Confirmed by a person</span> : <ConfidenceBar value={conf} threshold={threshold} />}
                      </td>
                      <td style={{ width: 170 }}>
                        {src?.model === "check" ? (
                          <span className="model-tag tag-check" title={`First read ${Math.round(src.firstConfidence * 100)}% sure`}>Re-checked by {modelName(checkModel)}</span>
                        ) : src?.model === "person" ? (
                          <span className="model-tag tag-person">Person</span>
                        ) : src?.model === "fast" ? (
                          <span className="model-tag tag-fast">{modelName(fastModel)}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card section">
            <div className="card-pad" style={{ paddingBottom: 8 }}>
              <h2>Line items</h2>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.line_no}>
                    <td>{l.description}</td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{formatMoney(l.unit_price_cents, inv.currency ?? "USD")}</td>
                    <td className="num">{formatMoney(l.amount_cents, inv.currency ?? "USD")}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="num muted">Subtotal / tax / total</td>
                  <td className="num">
                    {formatMoney(inv.subtotal_cents, inv.currency ?? "USD")} / {formatMoney(inv.tax_cents, inv.currency ?? "USD")} / <strong>{formatMoney(inv.total_cents, inv.currency ?? "USD")}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {inv.checks.length ? (
            <div className="card card-pad section" data-testid="checks">
              <div className="section-title">
                <h2>Checks done in code</h2>
                <span className="muted small">The AI reads the numbers. Code does the maths.</span>
              </div>
              <div className="checks">
                {inv.checks.map((c) => (
                  <div key={c.name} className={`check check-${c.status}`}>
                    <span className="check-icon">{c.status === "pass" ? "✓" : c.status === "fail" ? "!" : "-"}</span>
                    <div>
                      <strong>{c.name}</strong>
                      <div className="muted">{c.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="card card-pad section" data-testid="audit">
            <div className="section-title">
              <h2>History</h2>
              <span className="muted small">Every step, who did it and why</span>
            </div>
            <ul className="timeline">
              {audit.map((a) => (
                <li key={a.id}>
                  <span className="when">{when(a.at)}</span>
                  <div>
                    <span className="what">{ACTION_LABELS[a.action] ?? a.action}</span>
                    <span className="actor-chip">{ACTORS[a.actor as ActorId]?.label ?? a.actor}</span>
                    <div className="muted">{a.detail}</div>
                    {a.reason ? <div className="why">Reason: {a.reason}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
