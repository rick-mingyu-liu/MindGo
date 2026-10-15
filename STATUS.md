# TermPocket — status and plan

As of 2026-10-15. Update this file when a step below completes; git history keeps the earlier versions.

## Summary

Pocky, TermPocket's bilingual assistant, can now record, investigate and plan. The implementation is merged to `main`; production launch is still pending verification and the database migrations.

- **Built:** recording transactions by chat with button-only saving, read-only questions about your own spending, and planning (cash projections, savings-goal proposals). The stock watchlist and the old one-shot AI plans are removed.
- **Production:** the new code defaults to the agent off. The launch runbook includes migrations 013–015 on Neon and two Render settings; 013 is required for recording, while 015 enables goal proposals. The runbook is the README section "Deploying Pocky to production", and `npm run agent:preflight` checks each step.
- **Next:** complete the launch checks and hardening gates, then use Pocky for a week. Pocky memory follows, shaped by what real use shows.

## What is merged

The twelve original feature and deployment pull requests below landed between 2026-10-14 and 2026-10-15 (UTC). GitHub confirms that each passed the backend and frontend CI jobs before merge. PR [#65](https://github.com/rick-mingyu-liu/TermPocket/pull/65) also has a failed GitGuardian check: its finding points to the deliberately fictional `FAKE_PASSWORD` in [`agentPreflight.test.ts`](backend/test/agentPreflight.test.ts), used only with a stub database and an `.invalid` hostname. Code inspection identifies this as a test-fixture false positive; the historical check remains failed.

| PR | Merged | Change |
| --- | --- | --- |
| #65 | 2026-10-15 | Pocky deploy preflight (`npm run agent:preflight`), Docker test database and Linux rehearsal of Render, Node pinned to 22, production runbook |
| #64 | 2026-10-15 | Zone-less timestamps read and written as UTC on any host (off UTC, an expired verification link was accepted for 4 more hours) |
| #63 | 2026-10-15 | Planning: spending baseline, cash projections, savings-goal proposals confirmed by button; migration 015 |
| #62 | 2026-10-15 | Stock watchlist and AI plans removed; migration 014 drops their tables |
| #61 | 2026-10-15 | Investigation: read-only spending summaries, comparisons and record listing |
| #60 | 2026-10-15 | Term label locale key renamed to its English text |
| #59 | 2026-10-15 | Recording: chat drafts, button-only confirm, undo, conversation history; migration 013 (built by Codex, then reviewed and fixed) |
| #58 | 2026-10-14 | Legacy one-shot planning and stock features retired |
| #56 | 2026-10-14 | AI provider switched to DeepSeek |
| #55 | 2026-10-14 | Self-service MCP connections and term-pace comparisons |
| #54 | 2026-10-14 | Hourly maintenance, so Neon can scale to zero |
| #53 | 2026-10-14 | Rebrand from MindGo to TermPocket |

## Production

The local read-only preflight on 2026-10-15 verified the Neon database configured in `backend/.env`. Render's CLI token is expired, so its deployed commit, environment, instance type and runtime still require a separate check. Local environment and host checks do not establish Render's configuration.

| Item | State |
| --- | --- |
| Frontend (Vercel) and backend (Render) | Configured to deploy from `main` according to the runbook; current production deployment not independently verified |
| Neon PostgreSQL and source audit | PostgreSQL 17.11; 0 incompatible transaction source values; read-only preflight |
| Migration 013 (conversations) | Required state absent: 0/6 agent tables, source constraint does not allow `agent` |
| Migration 014 (drop `watchlist`, `ai_plans`) | Required state absent: `watchlist` has 23 rows, `ai_plans` has 0; applying 014 deletes those watchlist rows. Run only after both new deployments are verified and the owner accepts that deletion |
| Migration 015 (goal proposals) | Goal-proposal table absent; optional, but proposals are unavailable without it |
| `AGENT_ENABLED`, `DEEPSEEK_API_KEY` on Render | Unconfirmed; the local environment is not evidence of Render's values |
| Render plan (child processes, `/tmp`, memory, request time over 90 s, Shell) | Not yet confirmed |

Turning Pocky on is the runbook in the README. In short: deploy, run the preflight in the Render Shell, apply 013, 014 and 015 through Neon's direct endpoint, set the two variables, run the preflight with `--live`, then smoke-test in the app with fictional input.

## Evidence and limitations

The [CI run for merge commit `7609cf3`](https://github.com/rick-mingyu-liu/TermPocket/actions/runs/38760784901) confirms 783 backend tests passed with none skipped. The earlier handoff reports live DeepSeek checks on fictional data matching SQL or a hand calculation; those historical checks are distinguished below from fresh verification.

- **Tests:** 783/783 backend tests against PostgreSQL 17. They cover isolation between users, concurrent confirms, stale goal versions, migrations applied twice, and process/database timezone combinations. Frontend build, lint and locale checks pass; two existing hook-dependency warnings remain. The frontend has no test runner.
- **Historical live model checks (from the handoff):** term totals, comparisons with last term, top expenses, a February total including its last day, Chinese questions, a 3-month baseline, a projection low point of −10,020.00 on 2027-01-05, and 6,200 over 18 months = 344.45 a month. Stock advice was declined. "Record this and answer that" drafted the entry without saving it.
- **Historical Linux rehearsal (from the handoff):** 18/18 preflight checks passed in a fresh Node 22 container, including one live turn (1 tool call, 1 drafted row, about 3.5 s). This does not verify the Render host.
- **Historical browser checks (from the handoff):** the goal card, Confirm, the conflict warning and the phone layout were checked at desktop width and 375 px, in light and dark.
- **Fresh local read-only preflight:** 14 PASS, 3 WARN (migrations 013–015), 0 FAIL, 1 SKIP (live turn). The host was macOS arm64, not Render. No migrations or application writes were performed.
- **Fresh evaluation acceptance:** 36 fictional cases through real DeepSeek and in-memory record tools. The original run scored 35/36 because an assertion incorrectly rejected "nothing has been saved." After a narrow assertion correction, captured results score 36/36, and three new confirmation repetitions pass 3/3. These are distinct measurements, not a second full live run. The [acceptance report](https://github.com/rick-mingyu-liu/TermPocket/blob/feat/agent-eval/backend/eval/reports/2026-10-15.md) preserves the original results, correction, token counts and remaining wording limitations. The evaluation branch passes 801/801 backend tests with no skips on Node 22 and disposable PostgreSQL 17; independent review is complete.

Limitations:

- Currency conversion uses today's rates. The new model evaluation covers mixed currencies with fixed fictional rates; the live exchange-rate service was not exercised by that evaluation.
- Monthly goal targets count whole calendar months, so they err high.
- The prior x64 Linux rehearsal failed under emulation on this Apple-silicon Mac. Render's own Shell is still needed to check the deployed x64 runtime.
- There are no saved plans or remembered facts yet, so planning inputs must be repeated in each conversation.
- The on-screen privacy notice does not name DeepSeek, by the owner's decision. DeepSeek is named in Open Source Acknowledgements.

## In progress

The two hardening branches have been recovered from the interrupted session. Production migrations and agent enablement remain separate operator actions.

| Branch | What it adds | Done when |
| --- | --- | --- |
| `feat/agent-eval` — [PR #67](https://github.com/rick-mingyu-liu/TermPocket/pull/67) | 36 fictional prompts in English, Chinese and mixed, with expected tools, rows, goal proposals and reply checks. `npm run agent:eval` runs them against real DeepSeek. | Harness, full backend tests, independent review and live acceptance complete. The linked PR tracks CI and merge state. |
| `chore/dependency-upgrades` — [PR #66](https://github.com/rick-mingyu-liu/TermPocket/pull/66) | Backend audit clean; Next.js 15.5.28 retains React 18 and the Pages Router. Backend 783/783 tests, frontend build/lint/locales and HTTP route checks pass; independent review and all PR CI checks pass. | **Zero-high gate remains open:** frontend has 7 high and 2 moderate package findings from build-tool dependencies (`braces`, `postcss-selector-parser`). The PR remains open pending an explicit decision to merge the verified fixes with those findings tracked, or wait for full remediation. Details are in the PR's `frontend/DEPENDENCIES.md`. |

## Plan

Launch preparation and hardening can proceed in parallel. Verify both gates before the week of real use, then build memory from the observed failures.

| Step | Work | Gate before the next step |
| --- | --- | --- |
| 1. Go live | Runbook: Render plan check, deploy, preflight, migrations 013–015, enable, `--live` preflight, smoke test | The preflight passes with `--live`, and a fictional lunch can be drafted, confirmed and undone in the app |
| 2. Harden (alongside 1) | Merge the evaluation set and the dependency upgrades | One live evaluation run reviewed; no high-severity advisories |
| 3. Real use | Record real spending with Pocky for a week; note what it gets wrong | Real failures listed and added to the evaluation set |
| 4. Memory | Remembered facts (rent, co-op pay, reserve) with Remember and Forget, saved plans, per-account currency, timezone and reply language | Deleting a fact removes it from everything Pocky sees, and the evaluation set still passes |
| 5. Later | Dashboard summaries computed in SQL (unblocks an All time view), a frontend test runner, renaming leftover MindGo infrastructure | — |

Decisions needed from the owner:

- [ ] Confirm the Render instance type allows child processes and long requests, or choose to upgrade it.
- [ ] Run the three Neon migrations after deployment verification; explicitly accept removal of the 23 legacy watchlist rows before 014.
- [ ] Approve `AGENT_ENABLED=true` and the DeepSeek key on Render.
- [ ] Decide whether DeepSeek usage needs a monthly spending cap beyond the built-in per-user limits.
