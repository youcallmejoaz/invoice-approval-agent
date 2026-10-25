import fs from "node:fs";
import path from "node:path";
import { simpleParser } from "mailparser";
import { ingestFile, mimeFor } from "../pipeline";

/**
 * Mock email inbox: a folder of .eml files (the same format an IMAP server returns).
 * Each PDF or image attachment becomes an invoice. Handled messages move to processed/.
 * A real mailbox uses the same parsing; see imap.ts.
 */
export async function parseEmail(raw: Buffer) {
  const mail = await simpleParser(raw);
  const from = mail.from?.value[0]?.name || mail.from?.text || "unknown sender";
  const attachments = mail.attachments
    .filter((a) => a.filename && mimeFor(a.filename))
    .map((a) => ({ fileName: a.filename!, buffer: a.content }));
  return { from, subject: mail.subject ?? "", attachments };
}

export async function processInbox(dir: string): Promise<number> {
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  const messages = fs.readdirSync(dir).filter((n) => n.endsWith(".eml")).sort();
  for (const name of messages) {
    const full = path.join(dir, name);
    try {
      const { from, attachments } = await parseEmail(fs.readFileSync(full));
      for (const a of attachments) {
        await ingestFile({ buffer: a.buffer, fileName: a.fileName, source: "email", from });
        count++;
      }
    } catch (e) {
      console.error(`[inbox] ${name}: ${(e as Error).message}`);
    }
    fs.mkdirSync(path.join(dir, "processed"), { recursive: true });
    fs.renameSync(full, path.join(dir, "processed", name));
  }
  return count;
}

/** Builds a simple MIME email with one attachment, used to fill the mock inbox with sample invoices. */
export function buildEml(opts: { fromName: string; fromAddress: string; to: string; subject: string; text: string; fileName: string; mime: string; content: Buffer; date: Date }) {
  const boundary = "----=_sample_" + opts.fileName.replace(/[^a-z0-9]/gi, "");
  const b64 = opts.content.toString("base64").replace(/.{76}/g, "$&\r\n");
  return Buffer.from(
    [
      `From: "${opts.fromName}" <${opts.fromAddress}>`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      `Date: ${opts.date.toUTCString()}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      opts.text,
      "",
      `--${boundary}`,
      `Content-Type: ${opts.mime}; name="${opts.fileName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${opts.fileName}"`,
      "",
      b64,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
}
