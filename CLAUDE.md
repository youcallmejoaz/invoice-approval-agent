# CLAUDE.md

AI invoice approval agent. Invoices come in by upload, watched folder or mock email inbox; Claude Haiku extracts fields with a confidence per field, Claude Sonnet re-checks low-confidence fields, code validates the maths and blocks duplicates, rules route each invoice, and only approved bills post to the accounting system (mock ledger by default, Zoho Books and Xero stubs). See `PLAN.md` for the architecture.

## Commands

```bash
npm ci                 # install from the lockfile only
npm run seed           # reset data/, load vendors/POs/GRNs/rules, process the 40 sample invoices
npm run seed -- --empty  # same, but leave the invoice board empty (for upload demos)
npm run dev            # Next.js on :3000 + intake worker (watched folder + mock inbox)
npm test               # Vitest unit + acceptance tests
npm run test:e2e       # Playwright (builds nothing; start with `npm run build` first in CI)
npm run typecheck
npm run samples:generate  # regenerate samples/ and demo fixtures (dev only)
npm run fixtures:record   # replace demo fixtures with real Claude responses (needs ANTHROPIC_API_KEY)
npm run rules:add -- --name "..." --kind new_vendor --route manager --reason "..."
npm run report:blocked    # print invoices blocked today and why
```

`DEMO_MODE=1` (default) runs with zero API keys using `fixtures/extractions/`. `DEMO_MODE=0` plus `ANTHROPIC_API_KEY` calls Claude.

## Folder map

- `src/lib/` business logic, framework free, tested with Vitest
  - `extract/` demo and Claude extractors, PDF page handling, merge of Haiku and Sonnet results
  - `validate.ts`, `duplicates.ts`, `rules.ts`, `pipeline.ts`, `approvals.ts`, `posting.ts`
  - `accounting/` adapter interface, mock ledger, Zoho Books and Xero stubs
  - `intake/` watched folder, mock inbox, IMAP stub
- `src/app/` Next.js pages, server actions and API routes; `src/components/` client components
- `config/rules.json` default routing rules (rules are data)
- `samples/` sample invoices, `manifest.json` ground truth, `master/` vendors, POs, GRNs
- `fixtures/extractions/` demo model responses keyed by file sha256
- `scripts/` seed, sample generator, intake worker, fixture recorder, rule CLI
- `tests/` Vitest; `tests/e2e/` Playwright
- `clips/`, `docs/` video clips, proposal cut, portfolio copy, cover images

## Conventions

- TypeScript strict. Money is integer cents everywhere (`src/lib/money.ts`); never use floats for sums.
- Flags have a `code`, a `severity` (`error` blocks approval, `warning` needs a person) and a plain-English `message`.
- Every state change goes through a function in `src/lib` that writes to `audit_log`.
- Plain words in UI copy: no jargon, no em dashes, no emojis.
- Small, clearly named commits.

## Hard rules (guardrails)

1. Nothing posts to accounting without passing validation and the approval rules. `posting.ts` re-checks this in code before every post; tests prove it.
2. The model never decides money maths. It reads numbers; code adds them up and compares in cents.
3. Every change by a person (approve, reject, edit, rule change, retry) needs a reason and is logged with who and when.
4. Invoice files and extracted data stay in local storage (`data/`). In real mode only the needed page is sent to the model.
5. Exact duplicates are blocked, never posted.
6. Never commit secrets. `.env` is git-ignored; document new variables in `.env.example`. No real client names, emails or personal paths in the repo.
