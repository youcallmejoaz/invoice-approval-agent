import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { STATUS_LABELS, type Flag, type InvoiceStatus } from "@/lib/schemas";

const STATUS_COLOUR: Record<InvoiceStatus, string> = {
  needs_review: "pill-amber",
  awaiting_manager: "pill-violet",
  approved: "pill-blue",
  posted: "pill-green",
  post_failed: "pill-red",
  blocked: "pill-red",
  rejected: "pill-grey",
};

export function StatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`pill ${STATUS_COLOUR[status]}`} data-testid="status">
      <span className="dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function confidenceColour(c: number, threshold: number) {
  return c >= threshold ? "var(--green)" : c >= 0.6 ? "#d97706" : "var(--red)";
}

export function ConfidenceBar({ value, threshold }: { value: number; threshold: number }) {
  return (
    <div className="conf" title={`${Math.round(value * 100)}% sure`}>
      <div className="conf-bar">
        <div style={{ width: `${Math.round(value * 100)}%`, background: confidenceColour(value, threshold) }} />
      </div>
      <span className="conf-num" style={{ color: confidenceColour(value, threshold) }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

const FLAG_TITLES: Record<string, string> = {
  duplicate_file: "Duplicate blocked",
  duplicate_invoice_number: "Duplicate blocked",
  possible_duplicate: "Possible duplicate",
  subtotal_mismatch: "Line items do not add up",
  line_amount_mismatch: "Line amount is wrong",
  tax_mismatch: "Tax is wrong",
  total_mismatch: "Total is wrong",
  due_before_invoice: "Dates do not make sense",
  new_vendor: "New vendor",
  currency_mismatch: "Wrong currency",
  low_confidence: "AI not sure",
  missing_field: "Missing details",
  po_not_found: "Purchase order not found",
  po_vendor_mismatch: "Purchase order mismatch",
  po_price_mismatch: "Price differs from the purchase order",
  po_line_missing: "Not on the purchase order",
  quantity_over_received: "More than was received",
  goods_not_received: "Goods not received",
  po_total_exceeded: "Over the purchase order",
  tax_rate_changed: "Tax rate changed",
  extraction_failed: "Could not read the file",
};

export function flagTitle(code: string) {
  return FLAG_TITLES[code] ?? code;
}

export function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <div>
      {flags.map((f, i) => (
        <div key={i} className={`flag flag-${f.severity}`} data-testid={`flag-${f.code}`}>
          <div className="flag-icon">{f.severity === "error" ? "!" : "?"}</div>
          <div>
            <div className="flag-title">{flagTitle(f.code)}</div>
            <div>{f.message}</div>
            {f.relatedInvoiceId ? (
              <div style={{ marginTop: 6 }}>
                <Link href={`/invoices/${f.relatedInvoiceId}`}>Open the original invoice #{f.relatedInvoiceId}</Link>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Money({ cents, currency }: { cents: number | null; currency?: string | null }) {
  return <span className="mono">{formatMoney(cents, currency ?? "USD")}</span>;
}

export function when(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function UploadIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}

/** "claude-haiku-5-5" -> "Haiku 5.5" */
export function modelName(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id);
  if (!m) return id;
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? "." + m[3] : ""}`;
}
