# Transaction agent acceptance — 2026-10-14

This verifies the first transaction-recording slice described in [the phase-one spec](../../specs/2026-10-14-transaction-agent-phase-one.md), not the deferred spending-analysis, durable-memory or planning workflows.

## Runtime

The application adapter uses Claude Agent SDK 0.3.300 and DeepSeek `deepseek-flash` through the documented Anthropic-compatible endpoint. Tests used fictional expenses, with credentials loaded privately and never included in artifacts.

Eight live cases passed: English recording, Chinese numerals and relative dates, mixed-language multiple expenses, correction preserving an existing row ID, hypothetical purchase without a proposal, missing amount requiring clarification, visible CAD default, and conversational agreement without confirmation. A separate live case performed two sequential custom-tool calls and used the first tool result's generated row ID in the second call.

Real cancellation, deadline and invalid-key checks returned safe application errors and removed temporary runtime directories. Cancellation and deadline cleanup completed in approximately 0.3 seconds in this local run. Thirteen automated adapter tests cover restricted tools, invalid-proposal repair, attempted-call and token/output bounds, isolated child environment, cancellation and cleanup. These timings are observations, not deployment guarantees.

The earlier isolated probe's session-continuation evidence remains in [REPORT.md](REPORT.md). The application intentionally rebuilds bounded context from owned PostgreSQL history rather than persisting native SDK transcripts.

## Application and database

The full backend suite passed **701 tests, zero skipped**, against disposable local PostgreSQL 17. It includes real concurrent confirmation, atomic rollback, subset confirmation, stale versions, duplicate retries, owner constraints, undo after manual edits, conversation-cap concurrency, admission limits, retention and migration tests. The migration suite installs the schema twice, upgrades a pre-agent schema twice, and verifies incompatible source rows cause an audit failure without rewriting them. Existing MCP, screenshot import, goals and transaction regressions pass.

Browser/API checks with the real provider and fictional database verified draft creation, follow-up correction, no financial rows before the confirmation button, committed batches, exact-request replay without duplicates, undo, history resumption and a hypothetical purchase without a draft. Separate authenticated HTTP checks rejected another account's reads, edits, confirmation, messages and deletion, and returned separate conversation history.

Browser recovery checks exercised selection preservation after editing, stale-version recovery, a committed confirmation whose response was deliberately dropped, retry with the same operation key, partial confirmation, deletion preserving financial records, and cancellation while initial conversation creation was pending. No production database was accessed or migrated.

## Frontend and review

TypeScript, locale validation, lint and an isolated production build pass. Frontend lint retains the two pre-existing transaction-page hook warnings. Screenshots cover English and Chinese in light/dark mode at 375, 768 and 1365 pixels, plus the dashboard at mobile and desktop widths. Review found and corrected a conversation-history width overflow; the final grid constrains that list while retaining horizontal scrolling on small screens. The dashboard keeps goals and the recording panel side by side on desktop and stacked on mobile. Manual transaction forms remain available.

Independent backend and frontend reviews found and resolved the conversation-cap omission, clear-all/confirmation ordering race, cancellation during creation, selection reset after edits, and blocked recovery from stale edits. Reviewed fixes had no remaining actionable findings.

## Deployment limits

Production migration and enablement remain operator actions. Install migration 013 on PostgreSQL 15+, then enable migrated storage with `AGENT_ENABLED=true`; a DeepSeek key additionally enables model turns. The host must support Node child processes, the installed platform SDK binary, private temporary directories and requests lasting beyond the 90-second agent deadline. Actual provider execution was verified locally on macOS; a Linux production-host smoke test is still required before enabling production. CI exercises the Linux build and deterministic tests without provider credentials.

Conversation deletion removes messages and drafts, not saved transactions. This phase creates no durable facts, summaries or plans. Text is a permanent input method; optional voice remains deferred.
