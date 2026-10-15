# TermPocket — phase 2 plan

Drafted 2026-10-15. Phase 1 put Pocky into production: recording, investigation and planning, live on Render with migrations 013–015 on Neon ([`STATUS.md`](../STATUS.md)). Phase 2 takes TermPocket from "works for its owner" to "safe to post publicly", and adds voice input.

## Goals

1. **Public launch.** Strangers can sign up without risking their data, the owner's bill, or a broken first impression.
2. **Pocky, proven by real use.** A week of real recording shapes the fixes, and the evaluation set grows from real failures.
3. **Voice dictation.** Speak an entry in English (Chinese and mixed speech later); the transcript is produced on the device and edited before sending.

Out of scope: a spoken, real-time voice agent; stocks or one-shot AI plans (retired for good, and their tables are dropped); native mobile apps.

## Workstreams

### A. Launch blockers

These must be done before any public post.

| Item | Why | Done when | Size |
| --- | --- | --- | --- |
| Privacy policy and terms | The app stores financial records, and Pocky sends messages, matching records, dates, currencies and timezone to DeepSeek, outside Canada. The current notice does not name DeepSeek, which was a deliberate choice for personal use. Most users will be Canadian students, and PIPEDA expects cross-border processing to be disclosed. | `/privacy` and `/terms` pages in en and zh, linked from registration and the Pocky notice; the notice names the provider; reviewed against a template or by someone qualified | 1 day |
| DeepSeek spending cap | Sign-up is open, and each account gets 20 turns per hour. Nothing caps the total. | A provider-side spending limit or prepaid balance, plus an app-side daily turn cap per account (`config.agent`). Login already requires a verified email, so throwaway accounts each need a working mailbox | ½ day |
| Retention setting | Settings shows an auto-delete preference that is never stored and never acts. | It is stored and enforced by the hourly job through `utils/terms.ts`, or removed from the UI | ½–1 day |
| Transactional email on our own domain | Verification mail comes from a personal mailbox, which hits spam and sending limits once volume grows. | Resend or Postmark sending from `noreply@<domain>`, SPF/DKIM/DMARC passing, `EMAIL_*` config switched | ½ day, after the domain |
| Custom domain | A real address for posting. | Apex domain on Vercel and `api.` on Render, both with TLS; `CORS_ORIGIN`, `FRONTEND_URL` and `NEXT_PUBLIC_API_URL` updated; `mind-go.vercel.app` still works | ½ day |
| Demo account refresh | The demo dashboard empties about monthly. | `DEMO_REFRESH_ENABLED=true` on Render | 5 min |
| Phone OCR speed | Screenshot import is the headline feature, and it has only been timed on a laptop. | Timed on one mid-range phone; if it is slow, a clear in-app expectation | 1 hour |

### B. Pocky quality

| Item | Done when |
| --- | --- |
| Planning limit (found on the first real planning question: `agent_limit_exceeded` after 31 s) | Fixed in #84: thinking disabled for DeepSeek, the question is an evaluation case, failed runs record which limit tripped |
| Planning habits and projection start (second real question: 3-month baseline for "habits", a projection offered from a past date) | `fix/agent-planning-habits`: 12 months or term comparison for habits, projections from today |
| A week of real use | Every wrong draft, wrong number or refusal is written down and added to `backend/eval/` as a fictional case |
| Evaluation in the loop | `npm run agent:eval` passes before any prompt, tool or limit change merges |

### C. Voice dictation

Speech-to-text in the browser, tap to start and tap to stop by default (push-to-talk is an open question in `VOICE.md`), **English only for now** (owner's decision, 2026-10-15). The transcript is placed in the message box for the user to edit before Send. Recording rules do not change: only the confirm button saves. The full design and handoff is [`VOICE.md`](VOICE.md).

- **Engine:** an English-only on-device Whisper model (`tiny.en` or `base.en`) through Transformers.js, or whisper.cpp built for WebAssembly. Audio never leaves the device, which matches screenshot import's promise and adds nothing to the privacy policy. Rejected alternatives: the browser's built-in speech recognition (audio goes to Google or Apple, no Firefox support) and hosted transcription APIs (another data processor and another bill). Chinese and mixed speech can come later, with SenseVoice-Small as the first candidate.
- **Interim:** the phone keyboard's or macOS's own dictation already fills the message box; use it during the week of real use and note where it fails.
- **Spike (1 day), before committing:** see `VOICE.md` — the `onnxruntime-web` alias, accuracy on amounts and merchants, latency on a laptop and a phone, and the model download.
- **Build (2–3 days):** a microphone button on `/agent`, permission and error states, a 15-second cap, transcription in a worker, en and zh UI strings, and voice-style evaluation cases (spoken numbers, filler words). No backend change.
- **Done when:** a spoken English entry becomes a correct draft in under 5 s on a laptop, and the measured phone time is recorded.

### D. Pocky memory (after B's week of use)

As planned in [`STATUS.md`](../STATUS.md): remembered facts (rent, co-op pay, reserve) with Remember and Forget, saved plans, and per-account currency, timezone and reply language. **Done when** deleting a fact removes it from everything Pocky sees, and the evaluation set still passes.

### E. Data growth

The production database is 8.7 MB, within Neon's free-plan limit of 0.5 GB per project. A Pocky turn stores about 1 KB: the user's message and the reply. Drafts, runs and admission records are swept after 24 hours to 30 days, so conversation messages are what accumulates.

| Scenario | Growth | Time to 0.5 GB |
| --- | --- | --- |
| Today (a handful of users) | Under 1 MB a month | Decades |
| 100 active users, about 10 turns a day each | About 30 MB a month | About 15 months |
| One account at its cap (100 conversations × 200 messages) | About 20–40 MB, and it takes at least 500 hours at 20 turns an hour | — |

Work: before launch, add a usage panel (database size and agent turns per day) to the owner's routine checks. After launch, delete conversations idle for 12 months (policy text in A), and lower `maxConversations` if one account approaches its cap. Upgrading Neon is the fallback, not the plan.

### F. Product polish

- **Transactions list:** 200 per page with "Load more" and a keyset cursor (#83, merged).
- **Dashboard summaries in SQL:** removes the double serialisation in `/summary/rolling`, which blocks an "All time" period.
- **A frontend test runner:** starting with `lib/date.ts`, the untested twin of a tested backend module.

### G. Later

- Clear the frontend's remaining 7 high advisories, which come only from build tooling, by migrating to Tailwind 4. See [`frontend/DEPENDENCIES.md`](../frontend/DEPENDENCIES.md).
- Rename the leftover MindGo infrastructure.

## Order

| Week | Work | Gate |
| --- | --- | --- |
| 1 | B: fix the planning limit, start the week of real use. A: privacy policy, spending cap, demo refresh. Buy the domain. F: transactions list | Planning question passes; spending cap in place |
| 2 | A: retention setting, email and domain, phone OCR timing. C: voice spike | Every launch blocker in A is done |
| 3 | Public post. C: build voice if the spike passes. B: evaluation cases from real failures | Spike measurements meet "Done when" in C |
| 4+ | D: memory. E: idle-conversation deletion. F: summaries in SQL | — |

## Decisions needed from the owner

- [ ] The privacy policy: write it from a template, or have it reviewed. Whether the Pocky notice should name DeepSeek; this plan recommends yes for a public launch.
- [ ] The spending cap: a monthly amount, and a daily turn cap per account.
- [ ] The retention setting: implement it or remove it.
- [ ] The domain name and email provider.
- [ ] How long idle conversations are kept (proposed: 12 months).
