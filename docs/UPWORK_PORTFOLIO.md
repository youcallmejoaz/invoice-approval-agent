# Upwork portfolio entry

Character counts come from `node docs/count-chars.mjs`, which reads the fields from `docs/portfolio-fields.json`. Upwork limits: title 70, role 100, description 600, exactly 5 skills, cover image 4:3.

## 1. Project title (pick one)

| Option | Characters |
|---|---|
| **AI Invoice Processing Agent with Approvals and Duplicate Checks** (recommended) | 63/70 |
| Invoice Automation: AI Extraction, Validation and Zoho Sync | 59/70 |
| AI Accounts Payable Agent for Zoho Books and Xero | 49/70 |

Recommended: option 1. It uses the words clients search for ("invoice processing", "approvals", "duplicate") and only claims what the build proves. Options 2 and 3 lead with Zoho Books and Xero, but those adapters are documented stubs that need the client's credentials; the demo posts to a mock ledger.

## 2. Your role (95/100)

AI automation developer: built the extraction, validation, duplicate checks, approvals and sync

## 3. Project description (567/600)

Finance teams retype supplier invoices, pay duplicates twice and lose approvals in email. A demo build on sample data: invoices arrive by upload or email, AI reads every field with a confidence score, code checks the maths and purchase order match, duplicates are blocked, rules send each invoice to auto-approval or the right person, and approved bills post to the accounting system with a retry queue. Safeguards: nothing posts unapproved, every decision needs a reason and is logged. 59 automated tests. Stack: TypeScript, Next.js, SQLite, Claude Haiku and Sonnet.

The only number used, 59 automated tests, is the real count: 51 Vitest tests plus 8 Playwright browser tests, all passing locally and in GitHub Actions.

## 4. Skills (exactly 5)

1. AI Automation
2. Data Extraction
3. API Integration
4. Claude API
5. TypeScript

If Upwork does not offer "Claude API" as a tag when you type it, swap it for "Anthropic Claude" or, failing that, "Artificial Intelligence".

## 5. Content blocks, in order

1. **Cover image:** `docs/upwork-cover-a.png` (1600 x 1200, 4:3). Alternative: `docs/upwork-cover-b.png`.
2. **Video:** upload `clips/proposal_cut.mp4` (60 seconds, voiceover, no captions).
3. **Screenshot:** `docs/screenshots/invoice-detail.png`. Caption: "Every invoice shows what the AI read, how sure it was about each field, and the checks done in code."
4. **Screenshot:** `docs/screenshots/duplicate-blocked.png`. Caption: "A re-sent invoice is blocked before it is paid, with a link to the original it matches."
5. **Link:** https://github.com/youcallmejoaz/invoice-approval-agent
6. **YouTube:** _add the walkthrough link here once published._

## 6. Proposal snippet

Here is a 60 second demo of an invoice agent I built that reads invoices, checks the maths in code, blocks duplicates and only posts approved bills: https://github.com/youcallmejoaz/invoice-approval-agent/blob/main/clips/proposal_cut.mp4 (use View raw if it does not play). If your team handles invoices by hand, reply here and I'll show you how it would fit your workflow.

> The link points at the `main` branch, so it works once this work is merged into `main`.
