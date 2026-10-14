# Transaction-recording agent: first delivery

The user approved this working first slice after the broader conversational-agent design: record actual transactions through bilingual conversation, correct and confirm drafts, resume/delete conversations, cancel work and undo newly created entries. Spending investigation, durable facts, savings-goal changes, term plans and voice are deferred. Text input and manual transaction forms remain first-class.

## User experience

A dashboard panel sits beside Savings Goals on desktop and stacks on mobile. It opens `/agent`, with a conversation list and an English/Chinese composer. Show currency and timezone defaults before sending; reply language can follow the message or be fixed. The model may ask for clarification. It cannot commit transactions or treat conversational agreement as confirmation. Each draft row displays an interpreted date, decimal amount, currency, canonical category, description and income/expense direction. Cards support edits and selected/all confirmation. A database-confirmed receipt offers a ten-minute undo. A changed transaction causes undo to fail rather than silently deleting a manually edited record.

The conversation UI provides a pending progress state, Cancel and retry/reload. A run may call tools several times, but exposes only a proposal tool; the application validates and persists its completed proposals. Existing records are outside this phase's model context. Chinese and mixed input never imply CNY. Hypothetical/future spending asks a clarifying question or explains the limited scope, not a saved expense.

## Architecture and limits

Use the verified Claude Agent SDK 0.3.300 and DeepSeek endpoint behind a runtime adapter. Application HTTP responses contain app-owned messages/drafts/receipts, not SDK events. Build fresh context from at most 30 persisted messages and 24,000 history characters plus the current pending draft. This slice has no conversation summaries or durable-fact store; deleting history therefore removes the only persistent conversational memory. Native SDK transcripts are disabled and temporary per-run configuration is removed.

Run admission is PostgreSQL-backed and user-owned: one active turn/user, 20 turns/hour, expiring leases. The web process permits four simultaneous SDK executions. Each run is limited to 90 seconds, 8 application tool calls, 4,000 input characters, bounded tool output and 4,000 output tokens. Conversation history is bounded for retrieval; excessive conversations/turns are rejected clearly. No new scheduled loop, polling, arbitrary network, shell, filesystem or SQL tool is available to the model. Its subprocess receives only necessary provider configuration. Logs exclude conversation text, financial payloads and credentials.

## Financial writes and deletion

Draft payloads are validated and versioned on the server, bound to user and conversation, and expire after 24 hours. Card edits create a new version; confirmation names the specific reviewed version and selected row IDs. A confirmation idempotency key is bound to its operation. Permissions, expiry and current state are rechecked inside a short transaction; batches either commit entirely or roll back. Partial confirmation leaves the remaining rows at a new version. No DB transaction waits on the provider.

Deleting a conversation removes its messages, pending drafts, versions and runtime context; confirmed transactions remain. Minimal detached receipts retain just the IDs/timestamps needed for idempotency and unexpired undo, never deleted conversation bodies. Cancellation/deletion invalidates active runs so late provider results cannot recreate drafts. Settings clear-all explicitly includes conversations and pending drafts alongside the existing financial records. No approved-fact or plan memory is created in this phase.

## Database and rollout

Migration 013 adds owned tables with composite ownership relationships and bounds, and adds `agent` to transaction sources. It does not delete existing data or tighten unrelated legacy constraints. Schema, migration and row types must match; incompatible existing source rows are audited and cause an explicit failure, never silent rewriting. Verify fresh setup twice and upgrades on isolated fictional databases. Production migration remains an operator prerequisite, never run by this task.

`AGENT_ENABLED=true` declares the migration installed and enables storage endpoints; leave it false before migration so agent requests never query absent tables. `DEEPSEEK_API_KEY` additionally enables model execution. With the flag true but the key missing, existing history, draft confirmation, undo and deletion remain accessible. Disabling the flag hides these controls, so do not use it as a provider-only kill switch after rollout. The deployed runtime must support Node child processes, the SDK binary, writable temporary storage and the request deadline. Legacy AI-plan expiry/storage and read-only external MCP remain untouched. The UI discloses that conversation content is sent to DeepSeek and administrators can access stored records; it does not claim end-to-end encryption or automatic financial-data masking.

## Acceptance

Cover English/Chinese/mixed input, several expenses, corrections, missing amounts/currencies/dates, timezone boundaries, hypotheticals, UI-only confirmation, concurrent/repeated confirmation, account isolation, cancellation/deletion races, provider errors and quotas, partial selection and undo conflicts. Use actual provider calls with fictional inputs for extraction; mocked provider tests exercise deterministic failure paths. Test both database migration paths and existing MCP/import/manual transaction/goal regressions. Verify desktop/mobile, themes and locales, obtain independent review and passing CI, then open a PR against main without merging or deploying.
