import { NextResponse } from "next/server";
import { listInvoices } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/invoices?status=blocked&since=today  (JSON list with flags and reasons) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const where: string[] = [];
  const params: unknown[] = [];
  const status = url.searchParams.get("status");
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (url.searchParams.get("since") === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    where.push("received_at >= ?");
    params.push(d.toISOString());
  }
  const rows = listInvoices(where.join(" AND ") || "1=1", params).map((i) => ({
    id: i.id,
    file: i.file_name,
    source: i.source,
    status: i.status,
    vendor: i.vendor_name,
    invoiceNumber: i.invoice_number,
    total: i.total_cents === null ? null : i.total_cents / 100,
    currency: i.currency,
    duplicateOf: i.duplicate_of,
    flags: i.flags,
    reasons: i.reasons,
  }));
  return NextResponse.json({ count: rows.length, invoices: rows });
}
