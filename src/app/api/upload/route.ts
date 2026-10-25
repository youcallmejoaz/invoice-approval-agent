import { NextResponse } from "next/server";
import { ingestFile } from "@/lib/pipeline";

export const runtime = "nodejs";
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 20 MB." }, { status: 413 });
  try {
    const inv = await ingestFile({ buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, source: "upload" });
    return NextResponse.json({ id: inv.id, status: inv.status, route: inv.route });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
