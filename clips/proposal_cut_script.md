# Proposal cut script

A 60 to 90 second cut for Upwork proposals, built only from the Phase 3 clips. Neutral narrator, no captions, no music, no contact details.

| Scene | Clips | Narration |
|---|---|---|
| 1 | K01 | If your team still types invoices into the accounting system by hand, mistakes and duplicate payments are only a matter of time. |
| 2 | C01, C02 | Here, invoices are uploaded or emailed in, and each one is read, checked and sorted in seconds. |
| 3 | C03 | You can see exactly what the AI read, and how sure it is about every field. |
| 4 | C04, C05 | Duplicates are blocked before they are paid, and invoices that do not add up are flagged with the reason. |
| 5 | C06 | Small, clean invoices are approved automatically. Bigger ones go to the right person, and every decision is logged. |
| 6 | C07, C08 | Only approved bills are posted to your accounting system, and anything that fails is retried, not lost. |
| 7 | K04 | If you want your invoices handled like this, reply to this proposal, and we can map it to your accounting setup. |

## How it is rendered

`python clips/tts.py` makes one WAV per scene (Kokoro, voice `am_michael`, speed 1.0). `node clips/render_proposal.mjs` sets each scene to its audio length plus 0.5 seconds, fits clips by trimming or holding the last frame (never faster than 1.25x), uses a 0.3 second crossfade from the opening card into the UI, a slow 5 percent push-in on shots longer than 8 seconds, normalises the voice to about -16 LUFS and writes `clips/proposal_cut.mp4` (1920 x 1080, 30 fps, H.264, AAC).
