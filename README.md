# AI Invoice Approval Agent

Invoices arrive by email or upload, get read, checked, de-duplicated and routed for approval. Only approved ones are posted to the accounting system, and every flag comes with a reason.

> A demo build on sample data. It runs end to end with no API keys (`DEMO_MODE=1`).

## The problem

Small and mid-size finance teams still type supplier invoices into Zoho Books, Xero or QuickBooks by hand. That is slow, it invites typing mistakes, and the same invoice sent twice (or re-sent as a "second notice") gets paid twice. Approvals get lost in email threads, and nobody can say later who approved what, or why.

## What it does

- **Reads every invoice.** PDFs and photos arrive by upload, a watched folder or an email inbox. AI reads the vendor, invoice number, dates, line items, tax and total, and says how sure it is about each field.
- **Checks the maths in code.** Line items must add up to the subtotal, tax must match the rate, the total must match, the due date must make sense, the vendor must be known, and invoices with a purchase order are matched against the order and the goods received.
- **Blocks duplicates.** The same file, or the same vendor and invoice number, is blocked. Invoices that look alike (same vendor, total within 1 percent, dated within 10 days) are flagged for a person.
- **Routes approvals by rules.** Clean invoices under the limit are approved automatically. Bigger ones go to a finance manager. New vendors, failed checks and anything the AI was not sure about always go to a person. Rules are data you can change.
- **Posts only approved bills.** Approved invoices are posted as bills to the accounting system. If posting fails, the bill waits in an error queue with a plain-English reason and a retry button.
- **Keeps a full history.** A dashboard shows today's numbers, and every invoice has a timeline of who did what, when and why.

## How it works, in four steps

1. Invoices come in by email or upload.
2. AI reads each one and says how sure it is about every field; the maths and duplicates are checked by code.
3. Clean, small invoices are approved automatically; everything else goes to the right person with the reason shown.
4. Approved bills are posted to the accounting system, and every step is logged.

## Safeguards

- **Nothing posts without passing every check and the approval rules.** The posting step re-checks this in code right before every post, and tests prove it.
- **The AI never decides money maths.** It reads the numbers; code adds them up, in whole cents.
- **Every change by a person needs a reason** (approve, reject, correct a field, change a rule, retry a post) and is logged with who and when.
- **Unclear reads are never guessed.** If a field is still unclear after a second, stronger AI look, the invoice goes to a person, and the maths that depends on that field is skipped rather than guessed.
- **Exact duplicates are blocked and can never be posted.**
- **Your files stay in your storage.** In live mode only the page the AI needs is sent to it.

## Demo

- Proposal cut (60 to 90 seconds): [clips/proposal_cut.mp4](clips/proposal_cut.mp4) (use "View raw" if it does not play in the browser)
- YouTube walkthrough: _link coming soon_
- All clips: [clips/MANIFEST.md](clips/MANIFEST.md)

## Run it

Needs Node.js 20 or newer.

```bash
npm ci            # install exact versions from the lockfile
npm run seed      # load sample vendors, purchase orders and the 40 sample invoices
npm run dev       # open http://localhost:3000
```

`npm run dev` also starts the intake worker: drop a PDF into `data/incoming/`, or an `.eml` file into `data/inbox/`, and it appears on the board within seconds.

To start with an empty board and upload the samples yourself: `npm run seed -- --empty`, then drag the files from `samples/invoices/` onto the upload area.

Use the "Acting as" switch (top right) to act as the AP Clerk or the Finance Manager. Only the Finance Manager can approve invoices over the limit.

### Live mode (real AI)

Copy `.env.example` to `.env`, set `DEMO_MODE=0` and `ANTHROPIC_API_KEY`. Claude Haiku reads each invoice first; only fields it is unsure about are re-checked by Claude Sonnet. `npm run fixtures:record` replaces the demo responses with real ones.

### Connecting accounting

`ACCOUNTING_ADAPTER=mock` (default) posts to a built-in ledger. `zoho` and `xero` use the adapters in `src/lib/accounting/`, which contain the field mapping for each system and need the client's credentials plus a short mapping session (`config/accounting-map.json`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | App on port 3000 plus the folder and inbox watcher |
| `npm run seed` | Reset the data and process the 40 sample invoices |
| `npm test` | Unit, guardrail and acceptance tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright; run `npm run build` first) |
| `npm run rules:add -- --name "New vendor needs manager" --kind new_vendor --route manager --reason "Fraud control"` | Add a routing rule from the command line |
| `npm run report:blocked` | Every invoice blocked today and why |
| `npm run samples:generate` | Regenerate the sample invoices and demo fixtures |

## Architecture

```
upload / watched folder / mock inbox (.eml)        IMAP adapter documented
          |
   store file (data/files, by sha256)
          |
   extraction    demo: fixtures keyed by file hash      live: Haiku, then Sonnet on low-confidence fields
          |
   validation    code only, integer cents: lines, subtotal, tax, total, dates, vendor, currency, PO + goods received
          |
   duplicates    exact (same file, same vendor + number) -> blocked;  likely (1%, 10 days) -> flagged
          |
   routing rules (data in the rules table, strictest wins, built-in safety floor)
          |
   approval      approve / reject / correct, reason required, logged
          |
   posting guard re-checks approval, validation, duplicates and approver role in code
          |
   accounting adapter: mock ledger | Zoho Books | Xero  -> error queue + retry on failure
```

- **Stack:** TypeScript, Next.js (App Router), SQLite (better-sqlite3), Anthropic SDK with Zod structured output, pdf.js, pdfkit, Vitest, Playwright.
- **Code:** business logic lives in `src/lib` as plain TypeScript (no framework), so it is tested directly. Pages are in `src/app`. See [PLAN.md](PLAN.md) for the data model and [CLAUDE.md](CLAUDE.md) for conventions.
- **Sample data:** 40 invoices from 8 fictional vendors plus one new vendor, 6 purchase orders with goods received notes. Built-in problems: 3 duplicates (one exact, one re-sent with a new file, one near duplicate), 2 maths errors, 1 new vendor, 2 low quality scans, 1 invoice over the approval limit, and 1 bill whose first post fails. Ground truth is in `samples/manifest.json`.

## Tests

`npm test` runs 51 tests, including the acceptance criteria against the full sample set:

- all 3 duplicates are caught (2 blocked, 1 flagged) and no clean invoice is flagged
- both maths errors are flagged with the right reason
- every sample invoice is routed to its expected place
- a failed post lands in the error queue and a retry succeeds
- at least 35 of 40 extractions match the ground truth, and the rest go to review instead of being guessed
- nothing posts without approval and passing validation; every human action needs a reason and is logged

`npm run test:e2e` runs 8 browser tests. GitHub Actions runs both on every push, in demo mode with no keys.

## Honest limits

- The demo responses in `fixtures/` are **simulated**: no API key was available while building, so they were generated from the sample ground truth with realistic imperfections (low confidence on scans, one misread total). `npm run fixtures:record` records real ones.
- Real Zoho Books and Xero posting needs the client's API credentials and a short mapping session; the demo uses a mock ledger. The adapters are untested against a live account.
- Very poor scans still need a person; the agent sends them to review instead of guessing.
- SQLite only today; the schema is plain SQL, but a Postgres adapter is not wired up yet.
- Login is a demo "acting as" switch, not real user accounts.
- Running cost in live mode (estimate, at list prices when built): a Haiku read of a one-page invoice is roughly 2,000 to 3,000 tokens, well under a tenth of a cent. A Sonnet re-check adds roughly 1 to 3 cents for that invoice. Only a minority of invoices need the re-check.

## License

MIT
