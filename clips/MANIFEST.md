# Clip manifest

All clips are 1920 x 1080, H.264, yuv420p, 30 fps, no audio, recorded in demo mode on sample data (`node clips/record.mjs`). One review frame per clip is in `frames/`. Card stills are the matching `.png` files.

| Clip ID | File | Duration | What it shows | Video section |
|---|---|---|---|---|
| K01 | [K01_problem.mp4](K01_problem.mp4) | 6.3 s | Card: invoices typed in by hand, duplicates paid twice, approvals lost in email | 1. The problem |
| P01 | [P01_build_prompt.mp4](P01_build_prompt.mp4) | 11.2 s | Terminal replay: SHOW prompt 1 typed, the 8-point plan appears | 2. Building it |
| C01 | [C01_upload.mp4](C01_upload.mp4) | 8.3 s | 40 invoices dragged onto the upload area, progress bar runs | 3. Invoices come in |
| C02 | [C02_board.mp4](C02_board.mp4) | 13.0 s | Board fills live: Needs review, Auto-approved, Blocked, Errors | 3. Invoices come in |
| C03 | [C03_invoice_detail.mp4](C03_invoice_detail.mp4) | 11.9 s | Invoice opened: PDF on the left, fields with confidence on the right, one field re-checked by Sonnet, code checks | 4. What the AI read |
| C04 | [C04_duplicate_blocked.mp4](C04_duplicate_blocked.mp4) | 5.7 s | Re-sent invoice blocked, message names the original invoice it matches | 5. Checks and duplicates |
| C04 close | [C04_duplicate_blocked_close.mp4](C04_duplicate_blocked_close.mp4) | 5.5 s | Close-up of the duplicate block message and link to the original | 5. Checks and duplicates |
| C05 | [C05_maths_error.mp4](C05_maths_error.mp4) | 5.1 s | Maths error flag: line items do not add up to the subtotal, approval locked | 5. Checks and duplicates |
| C05 close | [C05_maths_error_close.mp4](C05_maths_error_close.mp4) | 4.9 s | Close-up of the maths error message | 5. Checks and duplicates |
| K02 | [K02_flow.mp4](K02_flow.mp4) | 8.0 s | Card: read, check, de-duplicate, route, approve, post | 6. How it works |
| C06 | [C06_manager_approves.mp4](C06_manager_approves.mp4) | 14.6 s | Finance Manager approves the $8,748 over-limit invoice with a reason; status becomes Posted | 7. Approvals |
| P02 | [P02_rule_prompt.mp4](P02_rule_prompt.mp4) | 9.3 s | Terminal replay: SHOW prompt 2 typed, the new rule appears in the rules list (real command output) | 8. Changing the rules |
| C07 | [C07_ledger_retry.mp4](C07_ledger_retry.mp4) | 11.9 s | Mock ledger shows the posted bill; error queue retry succeeds and the queue is clear | 9. Posting to accounting |
| C08 | [C08_dashboard_audit.mp4](C08_dashboard_audit.mp4) | 9.1 s | Dashboard with today's counts, then the audit trail of one invoice | 10. Dashboard and audit |
| K03 | [K03_safeguards.mp4](K03_safeguards.mp4) | 7.1 s | Card: code checks the maths, approvals by rule, nothing posts unapproved, full audit log | 11. Safeguards |
| K04 | [K04_offer.mp4](K04_offer.mp4) | 7.4 s | Card: what a version for your business includes, built in a week, running cost labelled as an estimate | 12. The offer |

Proposal cut: [proposal_cut.mp4](proposal_cut.mp4), script in [proposal_cut_script.md](proposal_cut_script.md).
