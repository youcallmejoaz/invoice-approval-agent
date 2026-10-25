/**
 * Generates the sample invoice set (PDFs with pdfkit, two degraded JPEG "scans" with sharp),
 * the vendor / PO / goods received master data, the ground-truth manifest and the demo fixtures.
 *
 * The outputs are committed, so a fresh clone never needs to run this. Run with: npm run samples:generate
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { BILL_TO, INVOICES, LEDGER_FAULTS, PURCHASE_ORDERS, VENDORS, type SpecInvoice, type SpecLine, type SpecVendor } from "./sample-spec";
import type { Extraction } from "../src/lib/schemas";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "samples");
const INV_DIR = path.join(OUT, "invoices");
const FIX_DIR = path.join(ROOT, "fixtures", "extractions");

const cents = (n: number) => Math.round(n * 100);
const dollars = (c: number) => c / 100;
const money = (c: number) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2));
const unitText = (c: number) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const longDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Truth = {
  seq: number;
  file: string;
  channel: "upload" | "email";
  scenario: string;
  vendorName: string;
  vendorInMaster: boolean;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  poNumber: string | null;
  taxRate: number;
  lines: { description: string; quantity: number; unitPriceCents: number; amountCents: number }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  duplicateOfSeq: number | null;
  expectedRoute: string;
  expectedFlags: string[];
};

function buildTruth(inv: SpecInvoice, vendor: SpecVendor, file: string): Truth {
  const src = inv.duplicateOfSeq && inv.scenario === "exact_duplicate" ? INVOICES.find((i) => i.seq === inv.duplicateOfSeq)! : inv;
  const lines = src.lines.map((l: SpecLine) => ({
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: cents(l.unitPrice),
    amountCents: Math.round(l.quantity * cents(l.unitPrice)),
  }));
  const lineSum = lines.reduce((a, l) => a + l.amountCents, 0);
  const subtotalCents = src.printedSubtotal !== undefined ? cents(src.printedSubtotal) : lineSum;
  const taxCents = src.printedTax !== undefined ? cents(src.printedTax) : Math.round((subtotalCents * vendor.taxRate) / 100);
  return {
    seq: inv.seq,
    file,
    channel: inv.channel,
    scenario: inv.scenario,
    vendorName: vendor.name,
    vendorInMaster: vendor.inMaster,
    invoiceNumber: src.invoiceNumber,
    invoiceDate: src.invoiceDate,
    dueDate: addDays(src.invoiceDate, vendor.termsDays),
    currency: "USD",
    poNumber: src.poNumber ?? null,
    taxRate: vendor.taxRate,
    lines,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    duplicateOfSeq: inv.duplicateOfSeq ?? null,
    expectedRoute: inv.expectedRoute,
    expectedFlags: inv.expectedFlags,
  };
}

function renderPdf(t: Truth, vendor: SpecVendor, stamp?: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 54,
      info: {
        Title: `Invoice ${t.invoiceNumber}`,
        Author: vendor.name,
        Creator: "sample generator",
        Producer: "sample generator",
        CreationDate: new Date(t.invoiceDate + "T09:00:00Z"),
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const W = doc.page.width;
    const left = 54;
    const right = W - 54;
    let y = 54;

    if (vendor.layout === "band") {
      doc.rect(0, 0, W, 96).fill(vendor.accent);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text(vendor.name, left, 30, { width: 360 });
      doc.font("Helvetica").fontSize(10).text(vendor.address, left, 60);
      doc.font("Helvetica-Bold").fontSize(26).text("INVOICE", right - 200, 34, { width: 200, align: "right" });
      y = 126;
    } else {
      doc.fillColor(vendor.accent).font("Helvetica-Bold").fontSize(22).text(vendor.name, left, y, { width: 340 });
      doc.fillColor("#444444").font("Helvetica").fontSize(10).text(vendor.address, left, y + 30);
      doc.fillColor("#222222").font("Helvetica-Bold").fontSize(28).text("INVOICE", right - 200, y, { width: 200, align: "right" });
      doc.moveTo(left, y + 56).lineTo(right, y + 56).lineWidth(2).strokeColor(vendor.accent).stroke();
      y += 76;
    }

    // Bill to + invoice meta
    doc.fillColor("#666666").font("Helvetica-Bold").fontSize(9).text("BILL TO", left, y);
    doc.fillColor("#222222").font("Helvetica").fontSize(11);
    BILL_TO.forEach((line, i) => doc.text(line, left, y + 14 + i * 15));

    const meta: [string, string][] = [
      ["Invoice number", t.invoiceNumber],
      ["Invoice date", longDate(t.invoiceDate)],
      ["Due date", longDate(t.dueDate)],
    ];
    if (t.poNumber) meta.push(["PO number", t.poNumber]);
    meta.push(["Currency", t.currency]);
    meta.forEach(([k, v], i) => {
      doc.fillColor("#666666").font("Helvetica").fontSize(10).text(k, right - 250, y + i * 17, { width: 110 });
      doc.fillColor("#222222").font("Helvetica-Bold").fontSize(10).text(v, right - 140, y + i * 17, { width: 140, align: "right" });
    });
    y += Math.max(70, meta.length * 17) + 26;

    // Table
    const cols = { desc: left, qty: left + 270, unit: left + 340, amt: right - 100 };
    doc.rect(left, y, right - left, 22).fill(vendor.accent);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
    doc.text("Description", cols.desc + 8, y + 6);
    doc.text("Qty", cols.qty, y + 6, { width: 50, align: "right" });
    doc.text("Unit price", cols.unit, y + 6, { width: 90, align: "right" });
    doc.text("Amount", cols.amt, y + 6, { width: 92, align: "right" });
    y += 22;
    doc.font("Helvetica").fontSize(10).fillColor("#222222");
    t.lines.forEach((l, i) => {
      if (i % 2 === 1) doc.rect(left, y, right - left, 22).fill("#f3f4f6").fillColor("#222222");
      doc.text(l.description, cols.desc + 8, y + 6, { width: 255 });
      doc.text(qtyText(l.quantity), cols.qty, y + 6, { width: 50, align: "right" });
      doc.text(unitText(l.unitPriceCents), cols.unit, y + 6, { width: 90, align: "right" });
      doc.text(money(l.amountCents), cols.amt, y + 6, { width: 92, align: "right" });
      y += 22;
    });
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor("#bbbbbb").stroke();
    y += 14;

    const totals: [string, string, boolean][] = [
      ["Subtotal", money(t.subtotalCents), false],
      [t.taxRate > 0 ? `Sales tax (${t.taxRate}%)` : "Sales tax (0%)", money(t.taxCents), false],
      ["Total due", money(t.totalCents), true],
    ];
    totals.forEach(([k, v, bold]) => {
      doc.fillColor(bold ? "#111111" : "#444444").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 13 : 11);
      doc.text(k, right - 260, y, { width: 150 });
      doc.text(v, right - 110, y, { width: 110, align: "right" });
      y += bold ? 22 : 18;
    });

    y += 30;
    doc.fillColor("#666666").font("Helvetica").fontSize(9);
    doc.text(`Payment terms: net ${daysBetween(t.invoiceDate, t.dueDate)} days. Please quote the invoice number with your payment.`, left, y, { width: right - left });
    doc.text("Thank you for your business.", left, y + 14);

    if (stamp) {
      doc.save();
      doc.rotate(-18, { origin: [W / 2, 300] });
      doc.fillColor("#c62828").opacity(0.75).font("Helvetica-Bold").fontSize(40).text(stamp, 120, 280, { width: W - 240, align: "center" });
      doc.restore();
    }
    doc.end();
  });
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Renders the invoice as an SVG page (150 dpi letter) to be degraded into a phone-camera style scan. */
function renderSvg(t: Truth, vendor: SpecVendor, smudge: boolean): string {
  const W = 1275;
  const H = 1650;
  const x0 = 110;
  const x1 = W - 110;
  const parts: string[] = [];
  const text = (x: number, y: number, s: string, size = 22, weight = 400, anchor = "start", fill = "#222") =>
    parts.push(`<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(s)}</text>`);
  parts.push(`<rect width="${W}" height="${H}" fill="#fbfaf6"/>`);
  text(x0, 150, vendor.name, 44, 700, "start", "#333");
  text(x0, 195, vendor.address, 22);
  text(x1, 150, "INVOICE", 54, 700, "end", "#333");
  parts.push(`<line x1="${x0}" y1="225" x2="${x1}" y2="225" stroke="#555" stroke-width="3"/>`);
  text(x0, 290, "BILL TO", 18, 700, "start", "#666");
  BILL_TO.forEach((l, i) => text(x0, 325 + i * 32, l, 24));
  const meta: [string, string][] = [
    ["Invoice number", t.invoiceNumber],
    ["Invoice date", longDate(t.invoiceDate)],
    ["Due date", longDate(t.dueDate)],
    ["Currency", t.currency],
  ];
  meta.forEach(([k, v], i) => {
    text(x1 - 520, 295 + i * 36, k, 22, 400, "start", "#555");
    text(x1, 295 + i * 36, v, 22, 700, "end");
  });
  let y = 500;
  parts.push(`<rect x="${x0}" y="${y}" width="${x1 - x0}" height="46" fill="#666"/>`);
  text(x0 + 16, y + 31, "Description", 21, 700, "start", "#fff");
  text(x0 + 640, y + 31, "Qty", 21, 700, "end", "#fff");
  text(x0 + 830, y + 31, "Unit price", 21, 700, "end", "#fff");
  text(x1 - 16, y + 31, "Amount", 21, 700, "end", "#fff");
  y += 46;
  t.lines.forEach((l) => {
    text(x0 + 16, y + 34, l.description, 22);
    text(x0 + 640, y + 34, qtyText(l.quantity), 22, 400, "end");
    text(x0 + 830, y + 34, unitText(l.unitPriceCents), 22, 400, "end");
    text(x1 - 16, y + 34, money(l.amountCents), 22, 400, "end");
    y += 50;
  });
  parts.push(`<line x1="${x0}" y1="${y + 6}" x2="${x1}" y2="${y + 6}" stroke="#999" stroke-width="1.5"/>`);
  y += 50;
  text(x1 - 520, y, "Subtotal", 24, 400, "start", "#444");
  text(x1, y, money(t.subtotalCents), 24, 400, "end");
  text(x1 - 520, y + 40, `Sales tax (${t.taxRate}%)`, 24, 400, "start", "#444");
  text(x1, y + 40, money(t.taxCents), 24, 400, "end");
  text(x1 - 520, y + 90, "Total due", 30, 700, "start", "#111");
  text(x1, y + 90, money(t.totalCents), 30, 700, "end", "#111");
  if (smudge) {
    // A water mark / fold shadow across the total, so the total is genuinely hard to read.
    parts.push(`<ellipse cx="${x1 - 70}" cy="${y + 80}" rx="130" ry="36" fill="#6b5f48" opacity="0.82"/>`);
    parts.push(`<line x1="0" y1="${y + 78}" x2="${W}" y2="${y + 98}" stroke="#bbb" stroke-width="10" opacity="0.6"/>`);
  }
  text(x0, y + 190, `Payment terms: net ${daysBetween(t.invoiceDate, t.dueDate)} days.`, 20, 400, "start", "#666");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`;
}

async function renderScan(t: Truth, vendor: SpecVendor, quality: "fair" | "poor"): Promise<Buffer> {
  const svg = renderSvg(t, vendor, quality === "poor");
  const W = 1275;
  const H = 1650;
  const rand = mulberry32(t.seq * 7919);
  const noise = Buffer.alloc(W * H * 4);
  const amp = quality === "poor" ? 70 : 38;
  for (let i = 0; i < W * H; i++) {
    const v = Math.floor(128 + (rand() - 0.5) * amp);
    noise[i * 4] = v;
    noise[i * 4 + 1] = v;
    noise[i * 4 + 2] = v;
    noise[i * 4 + 3] = quality === "poor" ? 70 : 45;
  }
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  const noisy = await sharp(base)
    .composite([{ input: noise, raw: { width: W, height: H, channels: 4 }, blend: "overlay" }])
    .png()
    .toBuffer();
  return sharp(noisy)
    .rotate(quality === "poor" ? -2.4 : 1.2, { background: "#d9d6cf" })
    .blur(quality === "poor" ? 2.3 : 1.5)
    .grayscale()
    .linear(quality === "poor" ? 0.72 : 0.85, quality === "poor" ? 38 : 22)
    .resize({ width: quality === "poor" ? 900 : 1100 })
    .jpeg({ quality: quality === "poor" ? 32 : 50, mozjpeg: true })
    .toBuffer();
}

/** Simulated model responses for demo mode, shaped exactly like the structured output real Claude returns. */
function buildFixture(t: Truth): { fast: Extraction; check: Partial<Extraction> | null } {
  const rand = mulberry32(t.seq * 104729);
  const c = (lo = 0.9, hi = 0.99) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  const fast: Extraction = {
    vendor_name: { value: t.vendorName, confidence: c(0.93, 0.99) },
    invoice_number: { value: t.invoiceNumber, confidence: c(0.92, 0.99) },
    invoice_date: { value: t.invoiceDate, confidence: c(0.92, 0.99) },
    due_date: { value: t.dueDate, confidence: c(0.9, 0.98) },
    currency: { value: t.currency, confidence: c(0.95, 0.99) },
    po_number: { value: t.poNumber, confidence: c(0.9, 0.99) },
    subtotal: { value: dollars(t.subtotalCents), confidence: c(0.93, 0.99) },
    tax_rate: { value: t.taxRate, confidence: c(0.9, 0.99) },
    tax: { value: dollars(t.taxCents), confidence: c(0.92, 0.99) },
    total: { value: dollars(t.totalCents), confidence: c(0.94, 0.99) },
    line_items: {
      value: t.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_price: dollars(l.unitPriceCents), amount: dollars(l.amountCents) })),
      confidence: c(0.9, 0.98),
    },
  };
  let check: Partial<Extraction> | null = null;

  if (t.seq === 10 || t.seq === 19) {
    // Due date printed in long form next to the PO block: the fast model is unsure, the re-check confirms it.
    fast.due_date.confidence = 0.74;
    check = { due_date: { value: t.dueDate, confidence: 0.97 } };
  }
  if (t.scenario === "scan_recovered") {
    fast.invoice_number = { value: t.invoiceNumber.replace("6618", "6G18"), confidence: 0.58 };
    fast.total = { value: dollars(t.totalCents), confidence: 0.71 };
    fast.line_items.confidence = 0.79;
    fast.tax_rate.confidence = 0.8;
    check = {
      invoice_number: { value: t.invoiceNumber, confidence: 0.94 },
      total: { value: dollars(t.totalCents), confidence: 0.95 },
      line_items: { value: fast.line_items.value, confidence: 0.93 },
      tax_rate: { value: t.taxRate, confidence: 0.93 },
    };
  }
  if (t.scenario === "scan_unclear") {
    // Total is covered by a stain: both models read it as 1,280.00 with low confidence (true value 1,230.00).
    fast.total = { value: 1280, confidence: 0.46 };
    fast.invoice_number.confidence = 0.66;
    fast.line_items.confidence = 0.62;
    fast.tax.confidence = 0.7;
    check = {
      total: { value: 1280, confidence: 0.61 },
      invoice_number: { value: t.invoiceNumber, confidence: 0.92 },
      line_items: { value: fast.line_items.value, confidence: 0.9 },
      tax: { value: dollars(t.taxCents), confidence: 0.91 },
    };
  }
  return { fast, check };
}

async function main() {
  fs.rmSync(INV_DIR, { recursive: true, force: true });
  fs.rmSync(FIX_DIR, { recursive: true, force: true });
  fs.mkdirSync(INV_DIR, { recursive: true });
  fs.mkdirSync(FIX_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUT, "master"), { recursive: true });

  const vendorById = new Map(VENDORS.map((v) => [v.id, v]));
  const truths: Truth[] = [];
  const bytesBySeq = new Map<number, Buffer>();

  for (const inv of INVOICES) {
    const vendor = vendorById.get(inv.vendorId)!;
    const ext = inv.format === "jpg" ? "jpg" : "pdf";
    const suffix = inv.scenario === "exact_duplicate" ? "-copy" : inv.scenario === "resent_duplicate" ? "-reminder" : "";
    const file = `${String(inv.seq).padStart(2, "0")}-${slug(vendor.name)}-${inv.invoiceNumber}${suffix}.${ext}`;
    const t = buildTruth(inv, vendor, file);
    let bytes: Buffer;
    if (inv.scenario === "exact_duplicate") bytes = bytesBySeq.get(inv.duplicateOfSeq!)!;
    else if (ext === "jpg") bytes = await renderScan(t, vendor, inv.scenario === "scan_unclear" ? "poor" : "fair");
    else bytes = await renderPdf(t, vendor, inv.stamp);
    bytesBySeq.set(inv.seq, bytes);
    fs.writeFileSync(path.join(INV_DIR, file), bytes);
    truths.push(t);

    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const fixturePath = path.join(FIX_DIR, `${sha256}.json`);
    if (!fs.existsSync(fixturePath)) {
      const { fast, check } = buildFixture(t);
      fs.writeFileSync(
        fixturePath,
        JSON.stringify(
          {
            file,
            sha256,
            simulated: true,
            note: "Simulated model response generated from the sample ground truth. Replace with real responses via npm run fixtures:record.",
            responses: { fast, check },
          },
          null,
          2,
        ) + "\n",
      );
    }
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ invoices: truths, ledgerFaults: LEDGER_FAULTS }, null, 2) + "\n");
  fs.writeFileSync(
    path.join(OUT, "master", "vendors.json"),
    JSON.stringify(
      VENDORS.filter((v) => v.inMaster).map((v) => ({ id: v.id, name: v.name, currency: "USD", taxRate: v.taxRate, paymentTermsDays: v.termsDays })),
      null,
      2,
    ) + "\n",
  );
  fs.writeFileSync(
    path.join(OUT, "master", "purchase_orders.json"),
    JSON.stringify(
      PURCHASE_ORDERS.map((p) => {
        const vendor = vendorById.get(p.vendorId)!;
        const sub = p.lines.reduce((a, l) => a + Math.round(l.quantity * cents(l.unitPrice)), 0);
        return {
          poNumber: p.poNumber,
          vendorId: p.vendorId,
          currency: "USD",
          totalCents: sub + Math.round((sub * vendor.taxRate) / 100),
          lines: p.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: cents(l.unitPrice) })),
          goodsReceived: {
            grnNumber: p.grnNumber,
            receivedAt: p.receivedAt,
            lines: p.lines.map((l) => ({ description: l.description, quantityReceived: l.quantity })),
          },
        };
      }),
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${truths.length} invoices to samples/invoices, manifest, master data and ${fs.readdirSync(FIX_DIR).length} fixtures.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
