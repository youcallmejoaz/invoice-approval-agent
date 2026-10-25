import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { getInvoice } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const inv = getInvoice(Number((await params).id));
  if (!inv) return new Response("Not found", { status: 404 });
  const filesDir = path.resolve(config().filesDir);
  const file = path.resolve(inv.file_path);
  if (!file.startsWith(filesDir + path.sep) || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: { "Content-Type": inv.mime, "Content-Disposition": `inline; filename="${inv.file_name.replace(/"/g, "")}"`, "Cache-Control": "private, max-age=3600" },
  });
}
