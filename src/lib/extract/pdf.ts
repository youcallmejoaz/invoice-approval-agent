import fs from "node:fs";
import { PDFDocument } from "pdf-lib";

export type ModelInput =
  | { kind: "text"; text: string; pagesSent: number[] }
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }
  | { kind: "pdf"; base64: string; pagesSent: number[] };

/** Plain text of each page of a text PDF, using pdfjs. */
export async function pdfPageTexts(buffer: Buffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as { str: string; transform: number[] }[]) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4], s: item.str });
      rows.set(y, row);
    }
    const text = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((r) => r.s).join("   "))
      .join("\n");
    pages.push(text);
  }
  await doc.destroy();
  return pages;
}

/**
 * Builds the smallest input that lets the model read the invoice. Text PDFs send only the text of the
 * first page (plus the last page when the totals are on it); scanned PDFs send only the first page as a
 * one-page PDF; images are sent as images. The file itself never leaves local storage in full.
 */
export async function buildModelInput(filePath: string, mime: string): Promise<ModelInput> {
  const buffer = fs.readFileSync(filePath);
  if (mime.startsWith("image/")) {
    return { kind: "image", mediaType: mime as "image/jpeg" | "image/png" | "image/webp", base64: buffer.toString("base64") };
  }
  const texts = await pdfPageTexts(buffer);
  if (texts[0] && texts[0].replace(/\s/g, "").length > 80) {
    const pagesSent = [1];
    let text = texts[0];
    const last = texts.length - 1;
    if (last > 0 && !/total/i.test(texts[0])) {
      text += `\n\n--- page ${last + 1} ---\n` + texts[last];
      pagesSent.push(last + 1);
    }
    return { kind: "text", text, pagesSent };
  }
  const src = await PDFDocument.load(buffer);
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(src, [0]);
  out.addPage(page);
  return { kind: "pdf", base64: Buffer.from(await out.save()).toString("base64"), pagesSent: [1] };
}
