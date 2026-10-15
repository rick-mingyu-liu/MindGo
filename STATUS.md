# TermPocket — status and plan

As of 2026-10-15. Update this file when a step below completes; git history keeps the earlier versions.

## Summary

Pocky, TermPocket's bilingual assistant, can now record, investigate and plan. It is live in production as of 2026-10-15: migrations 013 and 015 are applied, the agent is enabled on Render, and the Render Shell preflight passes with a live model turn.

- **Built:** recording transactions by chat with button-only saving, read-only questions about your own spending, and planning (cash projections, savings-goal proposals). The stock watchlist and the old one-shot AI plans are removed.
- **Production:** Render Starter instance with `AGENT_ENABLED=true` and the DeepSeek key; Neon has all three agent migrations: 013 (conversations), 014 (legacy `watchlist` and `ai_plans` dropped) and 015 (goal proposals). The runbook is the README section "Deploying Pocky to production", and `npm run agent:preflight` checks each step.
- **Next:** a fictional smoke test in the app (draft, confirm, undo), then use Pocky for a week. Pocky memory follows, shaped by what real use shows.

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

On 2026-10-15 the Render service was checked with its CLI: it was on the Free plan, which has no Shell, so the owner upgraded it to Starter and set `AGENT_ENABLED` and `DEEPSEEK_API_KEY`. Migrations 013 and 015 were then applied to Neon's `production` branch through the direct endpoint with `neonctl` (013's audit: 0 incompatible rows). The preflight in the Render Shell with `--live` passed: 17 PASS, 1 WARN (014), 0 FAIL. Migration 014 followed the same day, on the owner's decision that the stock watchlist and AI plans will never return: it dropped 23 `watchlist` rows and an empty `ai_plans` table. The production database was 8.7 MB afterwards.

| Item | State |
| --- | --- |
| Frontend (Vercel) and backend (Render) | Both deploy from `main`. Render's live deploy is `f772255` (the #79 merge), redeployed at 18:00 UTC when the instance and variables changed |
| Render service | Starter (0.5 CPU, 512 MB), region Oregon, one instance, build `npm ci --include=dev`. The x64 SDK binary is installed and launches; one live turn took 3.8 s. Memory under concurrent turns is unmeasured |
| Neon PostgreSQL and source audit | PostgreSQL 17.11; 0 incompatible transaction source values; read-only preflight |
| Migration 013 (conversations) | Applied 2026-10-15: 6/6 agent tables, source check allows `agent` |
| Migration 014 (drop `watchlist`, `ai_plans`) | Applied 2026-10-15: 23 watchlist rows and 0 AI plans dropped, by the owner's decision |
| Migration 015 (goal proposals) | Applied 2026-10-15: `agent_goal_proposals` present |
| `AGENT_ENABLED`, `DEEPSEEK_API_KEY` on Render | Set 2026-10-15. The `--live` preflight turn (1 tool call, 1 drafted row, 8,109 in / 201 out tokens, 3.8 s) confirms the key works |
| Render host checks | `/tmp` writable, linux-x64 glibc, Node 22.23.3, SDK binary launches, DeepSeek reachable (preflight in the Render Shell) |

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

## Hardening

The two hardening branches have been recovered from the interrupted session. Production migrations and agent enablement remain separate operator actions.

| Branch | What it adds | Done when |
| --- | --- | --- |
| `feat/agent-eval` — [PR #67](https://github.com/rick-mingyu-liu/TermPocket/pull/67) | 36 fictional prompts in English, Chinese and mixed, with expected tools, rows, goal proposals and reply checks. `npm run agent:eval` runs them against real DeepSeek. | Merged after independent review and all CI checks passed; harness, full backend tests and live acceptance complete. |
| `chore/dependency-upgrades` — [PR #66](https://github.com/rick-mingyu-liu/TermPocket/pull/66) | Backend audit clean; Next.js 15.5.28 retains React 18 and the Pages Router. Backend 783/783 tests, frontend build/lint/locales and HTTP route checks pass; independent review and all PR CI checks pass. | Merged with the owner's explicit approval to ship verified fixes while tracking the remaining findings. **Zero-high objective remains open:** frontend has 7 high and 2 moderate package findings from build-tool dependencies (`braces`, `postcss-selector-parser`). Details: [`frontend/DEPENDENCIES.md`](frontend/DEPENDENCIES.md). |

Ongoing dependency maintenance is configured in [`.github/dependabot.yml`](.github/dependabot.yml): weekly checks for the three npm projects and GitHub Actions, grouped minor/patch updates, separate major version PRs and separate security-update groups. Updates still require review and CI; no auto-merge is configured.

The first Dependabot round was resolved on 2026-10-15, and CI passed on `main` after each merge:

| PR | Update |
| --- | --- |
| #70 | `eval/` minor/patch group (2 packages) |
| #72, #73 | `actions/setup-node` and `actions/checkout` 4 → 7 |
| #74 | Backend minor/patch group (8 packages) |
| #75 | `helmet` 7 → 8.3.0 (merged after resolving a conflict with #74) |
| #76 | `express-rate-limit` 7 → 8.7.1 |
| #77 | Frontend minor/patch group (13 packages), with coordinated Radix patch versions |
| #78 | `lucide-react` 0.292 → 1.55.0 |
| #71 | Closed without merging: removing the vulnerable `postcss-selector-parser` pulled in Tailwind 4 without migrating the PostCSS configuration, and CI failed (see [`frontend/DEPENDENCIES.md`](frontend/DEPENDENCIES.md)) |

After that round, `npm audit` reports 0 findings for the backend and `eval/`. The frontend still has 7 high and 2 moderate findings, all in the build and lint toolchain (Tailwind 3's `chokidar`/`fast-glob`/`braces` chain and `eslint-config-next`).

## Plan

Launch preparation and hardening can proceed in parallel. Verify both gates before the week of real use, then build memory from the observed failures.

| Step | Work | Gate before the next step |
| --- | --- | --- |
| 1. Go live | Done except the in-app smoke test: Render on Starter, migrations 013–015 applied, agent enabled, `--live` preflight passes. A planning question hit `agent_limit_exceeded` in the first real use; a fix is in progress | A fictional lunch can be drafted, confirmed and undone in the app, and a planning question completes |
| 2. Harden (alongside 1) | Evaluation set and dependency upgrades are merged; the remaining work is the frontend build-tool advisories (Tailwind 4 or upstream fixes) | One live evaluation run reviewed (done); no high-severity advisories (open: 7 high in the frontend toolchain) |
| 3. Real use | Record real spending with Pocky for a week; note what it gets wrong | Real failures listed and added to the evaluation set |
| 4. Memory | Remembered facts (rent, co-op pay, reserve) with Remember and Forget, saved plans, per-account currency, timezone and reply language | Deleting a fact removes it from everything Pocky sees, and the evaluation set still passes |
| 5. Later | Dashboard summaries computed in SQL (unblocks an All time view), a frontend test runner, renaming leftover MindGo infrastructure | — |

Decisions needed from the owner:

- [x] Render instance type: upgraded from Free to Starter on 2026-10-15. Revisit Standard (2 GB) if the preflight or real use shows memory pressure.
- [x] Migrations 013 and 015 applied on 2026-10-15.
- [x] Migration 014 applied on 2026-10-15 (the owner confirmed both features are gone for good).
- [x] `AGENT_ENABLED=true` and the DeepSeek key are set on Render.
- [ ] Decide whether DeepSeek usage needs a monthly spending cap beyond the built-in per-user limits.
