/**
 * IMAP adapter (documented, not connected in the demo).
 *
 * The mock inbox (inbox.ts) parses .eml files with mailparser. A real mailbox delivers exactly the same
 * raw RFC 822 messages, so going live only swaps where the bytes come from:
 *
 *   1. npm install imapflow (pin the version, commit the lockfile)
 *   2. Set IMAP_HOST, IMAP_PORT (993), IMAP_USER, IMAP_PASSWORD (an app password), IMAP_FOLDER (e.g. "Invoices")
 *   3. Poll every INTAKE_POLL_MS:
 *
 *        const client = new ImapFlow({ host, port, secure: true, auth: { user, pass } });
 *        await client.connect();
 *        const lock = await client.getMailboxLock(folder);
 *        try {
 *          for await (const msg of client.fetch({ seen: false }, { source: true, uid: true })) {
 *            const { from, attachments } = await parseEmail(msg.source);      // from inbox.ts
 *            for (const a of attachments) await ingestFile({ buffer: a.buffer, fileName: a.fileName, source: "email", from });
 *            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
 *          }
 *        } finally { lock.release(); await client.logout(); }
 *
 * Duplicate protection does not depend on the mailbox: a re-delivered message produces the same file hash
 * and is blocked by duplicates.ts, so marking messages as seen is a convenience, not a safety measure.
 */
export const IMAP_ADAPTER_STATUS = "documented-stub" as const;
