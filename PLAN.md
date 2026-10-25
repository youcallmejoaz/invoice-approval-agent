# PLAN: AI Invoice Approval Agent

Invoices arrive by upload, a watched folder or a mock email inbox. Each one is read by AI with a confidence score per field, checked in code, de-duplicated, routed by rules, and only approved ones are posted to the accounting system. Every flag carries a plain-English reason and every step is logged.

## Architecture

```
 intake (upload API, watched folder, mock inbox .eml, IMAP stub)
        |
        v
 store file (data/files/<sha256>) -> invoices row (status: received)
        |
        v
 extraction  -- demo: fixtures/extractions/<sha256>.json (no keys)
             -- real: Haiku (all fields + confidence) -> Sonnet re-checks fields under threshold
        |       still unclear -> field marked unclear -> goes to a person
        v
 validation (code only, integer cents): line maths, subtotal, tax, total, dates,
             vendor exists, currency, 3-way match (PO + goods received)
        |
        v
 duplicates: exact (same file hash / same vendor + invoice number) -> BLOCKED
             likely (same vendor, total within 1%, dates within 10 days) -> flag
        |
        v
 routing rules (data in the rules table, seeded from config/rules.json)
     no rule matches -> auto-approved | review | manager (strictest wins) | blocked
        |
        v
 approval (person: approve / reject / edit, reason required, logged who + when)
        |
        v
 posting guard (code re-checks: approved, valid, not duplicate, right approver)
        |
        v
 accounting adapter: mock ledger (default) | Zoho Books stub | Xero stub
     failure -> error queue with plain-English reason -> retry button
```

Next.js (App Router) serves the UI and API. All business logic lives in `src/lib` as plain TypeScript so it is tested with Vitest without a browser. SQLite via better-sqlite3 (synchronous, one file). Money is stored and compared as integer cents; the model only reads numbers, code does every sum.

## Data model (SQLite)

| Table | Purpose |
|---|---|
| vendors | vendor master: id, name, currency, tax rate, payment terms |
| purchase_orders, po_lines | POs for 3-way match |
| goods_received, grn_lines | goods received notes for 3-way match |
| invoices | one row per received file: source, file hash, status, route, extracted header fields (cents), extraction JSON with confidence, flags JSON, duplicate_of, timestamps |
| invoice_lines | extracted line items (cents) |
| rules | routing rules as data: kind, params, route, enabled, priority, created_by |
| audit_log | every event: invoice, at, actor, action, detail, reason |
| ledger_bills | mock ledger: posted bills |
| sync_errors | error queue: invoice, adapter, plain reason, technical detail, resolved_at |
| ledger_faults | demo fault injection for the mock ledger (fail N times) |

Statuses: `needs_review`, `awaiting_manager`, `approved`, `posted`, `post_failed`, `blocked`, `rejected`.

## Folder layout

```
src/app/            pages: board (/), invoice detail, dashboard, ledger + error queue, rules, blocked
src/app/api/        upload, file download, invoices JSON
src/components/     client components (upload zone, decision forms, actor switcher)
src/lib/            config, db, money, schemas, audit, repo
src/lib/extract/    demo + Claude extractors, PDF page handling, merge logic
src/lib/accounting/ adapter interface, mock ledger, Zoho Books + Xero stubs with field maps
src/lib/intake/     watched folder, mock inbox (.eml), IMAP adapter (documented stub)
src/lib/            validate, duplicates, rules, pipeline, approvals, posting, dashboard
config/rules.json   default routing rules
samples/            40 generated invoices + manifest (ground truth) + vendor/PO/GRN master data
fixtures/           demo model responses keyed by file hash
scripts/            seed, generate samples, intake worker, record fixtures, add rule, blocked report
tests/              Vitest unit + acceptance tests; tests/e2e Playwright
clips/, docs/       video clips, proposal cut, portfolio, cover images
```

## Features mapped to evidence

| Feature | Evidence |
|---|---|
| Intake by upload, folder, email | Oct 24 "Complete Invoicing" post (invoice workflow) |
| Haiku first, Sonnet re-check, confidence per field | Market signal S8 (hybrid extraction) |
| Validation in code | Oct 24 "Complete Invoicing" post (validation) |
| Duplicate prevention | Oct 24 "Complete Invoicing" post (duplicate prevention) |
| Approval routing with reasons | Oct 24 "Complete Invoicing" post (approvals) |
| Accounting sync with error queue + retry | Oct 24 "Complete Invoicing" post (Zoho, error handling); Oct 24 e-commerce post and Oct 25 automation post (error handling, edge cases) |
| Dashboard + audit log | Oct 24 "Complete Invoicing" post (dashboard) |

## Sample data

40 files from 8 fictional vendors plus 1 new vendor, 6 POs with goods received notes. Built-in problems: 3 duplicates (exact file, re-sent with new file, near duplicate), 2 maths errors (line items vs subtotal, wrong tax), 1 new vendor, 2 low quality scans (one recovered by the Sonnet re-check, one still unclear), 1 over the approval limit, and 1 bill whose first posting fails (error queue demo). `samples/manifest.json` holds the ground truth and the expected route of every file.

Demo fixtures: no API key was available while building, so the fixtures are simulated model responses built from the ground truth with deliberate imperfections (low confidence on scans, a misread total). `npm run fixtures:record` replaces them with real recorded responses when a key is set.

## Test plan

- Unit: money, validation rules, duplicate checks, rule evaluation, merge of Haiku and Sonnet results, adapters' field mappings.
- Acceptance (Vitest, whole seeded set through the pipeline): 3 duplicates caught (2 blocked, 1 flagged), no clean invoice flagged; both maths errors flagged with the right reason; every file lands on its expected route; failed post goes to the error queue and retry succeeds; at least 35 of 40 extractions match ground truth and the rest go to review; guardrails (nothing posts without approval and passing validation, reasons required, actions logged).
- E2E (Playwright): board loads with seeded data, open an invoice, manager approves with a reason, bill appears in the ledger.
- CI: GitHub Actions on push runs typecheck, unit tests, build and e2e in demo mode with no keys.

## Build order

1. Scaffold, config, db schema, money helpers.
2. Sample generator + manifest + master data + demo fixtures.
3. Extraction (demo + real), validation, duplicates, rules, pipeline, approvals, posting, adapters.
4. Seed script, intake worker. Acceptance tests.
5. UI: board + upload, invoice detail, dashboard, ledger + error queue, rules, blocked today.
6. E2E, CI, README.
7. Clips, proposal cut, portfolio, cover images.

## Later (not in this build)

- Postgres adapter (schema is plain SQL and portable; only SQLite is wired up today).
- Live Zoho Books / Xero posting (needs client credentials and a mapping session).
- Live IMAP polling (adapter documented, not connected).
- User accounts and login (the demo uses an "acting as" switcher).
- Multi-currency approval limits.
