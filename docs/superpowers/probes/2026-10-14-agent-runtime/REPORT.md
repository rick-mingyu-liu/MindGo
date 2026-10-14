# Claude Agent SDK + DeepSeek compatibility probe

Probe date: 2026-10-14. Isolated temporary directory, fictional input and tool data only. No repository dependency or database changes. SDK 0.3.300 bundles Claude Code 2.1.300; provider probe Node 25.6.1 (workspace shell Node 26.10.0); DeepSeek `deepseek-flash` at `https://api.deepseek.com/anthropic`.

## Verified behavior

- Two real in-process MCP tool calls (`read_total`) and matching tool-result events in one conversation. The final answer reproduced both unique canaries delivered only through those tool results.
- A separate `query({ resume: sessionId })` reused the exact session ID and recalled both canaries plus the fictional nickname without another tool call.
- `tools: []` exposed no built-in shell, filesystem, SQL or network tools. Explicitly denied fictional tool was attempted, returned a permission error and never executed its handler.
- Two controlled application tool failures reached the model as `isError` tool results and the conversation completed. The timeout tool is a controlled error fixture; the caller deadline test separately aborts a live SDK run.
- AbortController cancellation and caller deadline stopped runs with no tool execution; observed end-to-end abort latency approximately 2.5 seconds including process teardown.
- Invalid fictional credential produced HTTP status 401, zero token usage, `is_error: true`, and a thrown error. The SDK's result subtype was **success**: adapters must check `is_error`, not subtype alone.
- `maxTurns: 1` produced `error_max_turns`. Two calls may execute within that one model turn: maxTurns does not replace an application tool-call counter.
- `persistSession: false` successfully completed a tool call and created no session transcript. The bounded-turn case also created no transcript with that option.
- A fresh stateless SDK query recalled the receipt canary from explicitly supplied application-owned history, with no tool calls or session transcript. This validates bounded database transcript replay without native SDK resume. An initial prompt that labeled history only as untrusted caused the model to refuse quotation; explicitly distinguishing data recall from following instructions resolved that failure without changing the canary assertion. The application prompt must make that distinction.
- Input, output and cache token counts were populated. SDK modelUsage marked DeepSeek `costBasis: unknown` and `provider: firstParty`, with generic context/output limits. SDK USD estimates and model capacity values must not be presented as authoritative DeepSeek billing or limits.

## Runtime decision

No essential integration incompatibility was observed. Claude Agent SDK + DeepSeek is viable behind a small application-owned service boundary. Production concurrency, memory/CPU, actual provider throttling/overload, and deployed Linux binary compatibility remain application validation work; the probe does not establish those properties.

Bare allowedTools names autoapprove before canUseTool. Use only registered application tools, `tools: []`, `settingSources: []`, isolated configuration/cwd, and a PreToolUse hook or application handlers to enforce every execution budget. Do not rely on canUseTool to gate already allowed tools. Financial writes must remain outside model tools and require server-confirmed drafts.

## Session persistence and deletion

The probe overrides HOME and CLAUDE_CONFIG_DIR to directories under its temporary root. Every observed SDK transcript is under `private-config/projects/` there; no user configuration or app project directories are used. Raw event files are private (0600) and excluded from the reproducible artifact set.

For the application, prefer `persistSession: false` with PostgreSQL conversation messages and bounded structured context rebuilt per request. Native SDK resume was verified separately, but native transcripts would introduce another memory store whose deletion, backups and user binding must be managed. If native resume is adopted, never use global `continue: true` in a multi-user service; bind a server-owned session ID to user/conversation, isolate paths, and delete its transcript/summary storage along with the conversation. Current SDK also offers SessionStore adapters, but that API was not exercised by this probe. Deleting PostgreSQL messages while leaving an SDK transcript allows deleted information to return; that design is unacceptable.

## Reproduce safely

Copy only `probe.mjs`, `verify.mjs`, `package.json`, `package-lock.json`, `REPORT.md`, and `verification.json`. Do not copy `*.private.json`, `private-config`, `empty-cwd`, or node_modules.

Run `npm ci --ignore-scripts --no-audit --no-fund` from the artifact directory. Set TERMPOCKET_PROBE_ENV_FILE to the local backend .env path (or supply DEEPSEEK_API_KEY through a secure environment). Never print it. Run `node probe.mjs`, then `node probe.mjs --limits-only`, then `node probe.mjs --replay-only`, then `node verify.mjs`. Tool traces/transcripts remain under `/private/tmp/termpocket-agent-probe` by default; TERMPOCKET_PROBE_ROOT can set another absolute temporary root for both scripts; the verifier resolves all artifacts under that root independent of its current directory. All private raw events, per-test metadata and native SDK config are confined there. Do not commit results.json (it retains private session IDs) or *.metadata.private.json. `verification.json` contains only operational assertions, no secrets or conversation text. The source never writes credential values, and provider subprocess logging is suppressed from the report.

## Official documentation

- [Custom tools and availability vs permission](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [Session options, persistence disabling and explicit resume](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Permission evaluation](https://code.claude.com/docs/en/agent-sdk/permissions)
- [Hosting, subprocesses and session state](https://code.claude.com/docs/en/agent-sdk/hosting)
- [DeepSeek Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api/)
- [DeepSeek Claude Code integration](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)
