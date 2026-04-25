# Claude-Mem

Persistent memory for Claude Code. Tool calls are captured, the Claude Agent SDK
compresses them into "observations" + per-session "summaries", and relevant
context is injected back into future sessions.

## Fork context

This is a single-user fork pruned from the upstream `thedotmack/claude-mem`.
The pruning has narrowed the supported surface — assume these constraints when
making changes:

- **Claude Code only.** No Cursor / Codex / OpenCode / Zed integrations.
- **Anthropic SDK only.** No Gemini, OpenRouter, or other providers.
- **Windows 11 + Linux/macOS dev.** Hook command strings in `plugin/hooks/hooks.json`
  must keep working under both `cmd.exe`/Git Bash and POSIX shells.
- **en-US only.** Translation scaffolding is kept but no other locales ship.
- **Keep:** viewer UI, Chroma vector search, smart-explore skill, all skills,
  `code--chill` and specialty modes (`law-study`, `meme-tokens`, etc.).

When trimming further, prefer deleting whole subsystems over partial cleanup.
Half-removed integrations are worse than fully present ones.

## Runtime topology

Three processes, two runtimes:

```
Claude Code  ──hook stdin──▶  worker-cli (Node)
                                  │
                                  │ HTTP (loopback)
                                  ▼
                              Worker (Bun) ◀──── Viewer UI (browser, SSE)
                                  │
                                  ├── SQLite (~/.claude-mem/claude-mem.db, bun:sqlite)
                                  ├── Chroma MCP (uvx subprocess, optional)
                                  └── Claude Agent SDK (subprocess per session)

MCP Server (Node)  ◀── Claude Desktop (separate, bundled but not active here)
```

- **Worker** runs on Bun because of `bun:sqlite`. It is the source of truth
  for everything — DB, queue, SSE broadcast, search, knowledge agents.
- **MCP server** runs on Node. It is a thin HTTP proxy to the worker — it must
  NOT import anything that pulls in `bun:*`. `scripts/build-hooks.js` enforces
  this with a regex check + 600 KB bundle-size budget on `mcp-server.cjs`.
- **CLI / hooks** run on either, brokered by `plugin/scripts/bun-runner.js`.

Default loopback port is `37700 + (uid % 100)` on Linux/macOS, `37777` on
Windows. Don't hardcode `37777` — read `CLAUDE_MEM_WORKER_PORT` or
`SettingsDefaultsManager.get('CLAUDE_MEM_WORKER_PORT')`.

## Hook contract

Wired in `plugin/hooks/hooks.json`. Each shell entry resolves the plugin root,
shells out to `worker-service.cjs hook claude-code <event>`, and the CLI
dispatches to a handler in `src/cli/handlers/`:

| Event             | Handler in `src/cli/handlers/` | Job |
|-------------------|--------------------------------|-----|
| Setup             | `smart-install.js` (script)    | Install Bun, uv, deps |
| SessionStart      | `context.ts`                   | Inject prior context as `additionalContext` |
| UserPromptSubmit  | `session-init.ts`              | Open session row, optional semantic inject |
| PreToolUse (Read) | `file-context.ts`              | Inject file-scoped observation history |
| PostToolUse       | `observation.ts`               | Strip privacy tags, enqueue observation |
| Stop              | `summarize.ts` + `session-complete.ts` | Enqueue summary, then mark complete |
| SessionEnd        | `session-complete.ts`          | Mark complete (idempotent) |

Adapters in `src/cli/adapters/` normalize stdin shape into `NormalizedHookInput`
(`src/cli/types.ts`). `claude-code.ts` is the only adapter that matters; `raw.ts`
exists for tests.

The handlers communicate with the worker via `workerHttpRequest()` in
`src/shared/worker-utils.ts` — do NOT spawn subprocesses from a handler.
Handlers must degrade gracefully (exit 0, empty `additionalContext`) when the
worker is unreachable. The Stop hook fires summarize as fire-and-forget so the
user is never blocked.

### Privacy tag stripping

Happens at the **hook layer** before anything reaches the worker. Tags removed:
`<private>`, `<system-reminder>`, `<claude-mem-context>`, `<system_instruction>`,
`<persisted-output>`. See `src/utils/tag-stripping.ts`. Do not move this into
the worker — edge stripping is the contract.

## Worker pipeline

Entry: `src/services/worker-service.ts` (1.3k LOC orchestrator).

1. Hook POSTs an observation to `/api/sessions/:id/observations`.
2. Routes are in `src/services/worker/http/routes/`. `SessionRoutes.ts` claims
   pending DB rows and ensures a generator is running.
3. `SessionManager` + `SessionQueueProcessor` (event-driven, no polling) yield
   pending messages to `SDKAgent.startSession()`, which streams them to the
   Claude Agent SDK.
4. SDK responses come back as `<observation>` / `<summary>` XML blocks. They
   are parsed by `src/sdk/parser.ts`, validated, written to SQLite in a single
   transaction by `SessionStore.storeObservations()`, broadcast via SSE
   (`SSEBroadcaster`), and (optionally) synced to Chroma.
5. Atomic claim-confirm: pending rows are marked `processing` on claim, deleted
   only after successful storage. Crash-safe.

Idle session reaper (every 2 min) and process orphan reaper (every 30 s) keep
state from drifting. Restart loops are bounded by `RestartGuard` (max 10
restarts in 60 s window).

## SQLite

`~/.claude-mem/claude-mem.db`. Bun's built-in SQLite driver. Worker is the only
writer.

Key tables (see `src/services/sqlite/migrations.ts`):

- `sdk_sessions` — one row per Claude Code session being observed.
- `observations` — extracted insights with `type`, `title`, `narrative`,
  `concepts` (JSON), `files_read`/`files_modified` (JSON), `discovery_tokens`
  (cost accounting), `agent_id`/`agent_type` (subagent attribution),
  `content_hash` (dedup).
- `session_summaries` — request / investigated / learned / completed / next_steps.
- `pending_messages` — durable work queue with claim-confirm lifecycle.
- `observations_fts` + `session_summaries_fts` — FTS5 indices, may be missing
  on Windows builds without FTS5; search code falls back gracefully.

Access pattern is split: thin re-exporter files (`Sessions.ts`, `Observations.ts`)
delegate to per-domain folders (`sessions/`, `observations/`). When adding a
new query, add it under the domain folder, not as a one-off in `SessionStore.ts`
(2.8k LOC and growing — already the worst hotspot).

## Search

Three layers. **Use `SearchOrchestrator.search()`, not the older facades.**

- `src/services/worker/search/SearchOrchestrator.ts` — current entry point.
- `src/services/worker/search/strategies/{Hybrid,SQLite,Chroma}SearchStrategy.ts`
  — strategy selected by orchestrator: filter-only → SQLite; semantic → Chroma
  with SQLite fallback; combined → Hybrid.
- `src/services/worker/SearchManager.ts` (2k LOC) and `src/services/worker/Search.ts`
  are legacy facades. Treat them as deprecated; new code should not extend them.

`ChromaSync.ts` writes vectors to a chroma-mcp subprocess (`uvx chroma-mcp`)
managed by `ChromaMcpManager.ts`. Chroma is optional —
`CLAUDE_MEM_CHROMA_ENABLED=false` makes the system SQLite + FTS5 only.

## Plugin surface

`plugin/` is what ships. Built artifacts live alongside source files (skills,
modes are source; `scripts/*.cjs` and `ui/viewer.html` are built).

- **Skills** (`plugin/skills/<name>/SKILL.md`) — auto-loaded by Claude Code:
  - `mem-search` — three-layer search via worker HTTP API.
  - `make-plan` — orchestrator for phased planning.
  - `do` — orchestrator that executes a phased plan via subagents.
  - `smart-explore` — codebase exploration helper.
  - `timeline-report` — render context around an observation.
  - `version-bump` — package version bump flow.
  - `knowledge-agent` — primes a corpus + answers via SDK session resume.
- **Modes** (`plugin/modes/*.json`) — observation-type taxonomies + recording
  prompts. `code` is the default. `code--chill` is selective. `law-study`,
  `email-investigation`, `meme-tokens` are specialty profiles. Selected at
  runtime by `ModeManager`.
- **Scripts** (`plugin/scripts/`) — `worker-service.cjs`, `mcp-server.cjs`,
  `context-generator.cjs` are esbuild outputs. `bun-runner.js`,
  `worker-cli.js`, `worker-wrapper.cjs`, `smart-install.js`,
  `statusline-counts.js` are hand-written shims (treat as source — they live
  in `plugin/`, not `src/`).
- **UI** (`plugin/ui/viewer.html`) — built React SPA. Source in `src/ui/viewer/`.
  Connects to the worker at `/stream` for SSE and `/api/*` for REST. Component
  files in `src/ui/viewer/components/`.

## Build

```bash
npm run build              # sync manifests + build hooks/worker/mcp/viewer
npm run build-and-sync     # build + copy to ~/.claude/plugins/...thedotmack + worker:restart
npm test                   # bun test
```

`scripts/build-hooks.js` is the workhorse — bundles three CJS targets via
esbuild (`worker-service.cjs`, `mcp-server.cjs`, `context-generator.cjs`) and
the NPX CLI ESM bundle. It strips esbuild's hardcoded `__dirname` (issue #1410)
and enforces the MCP/Bun separation (#1645).

`scripts/sync-plugin-manifests.js` keeps `.claude-plugin/plugin.json` in sync
with `package.json` — never edit `plugin.json` fields like `name`/`version`/
`description` directly.

## Settings

`~/.claude-mem/settings.json`, auto-created from
`SettingsDefaultsManager.DEFAULTS` (`src/shared/SettingsDefaultsManager.ts`).
Priority: `process.env` > settings file > defaults. The settings file uses a
flat schema; the manager auto-migrates legacy `{ env: {...} }` nested files.

When adding a new setting, add it to `SettingsDefaults` interface AND
`DEFAULTS` const in that one file. Do not read `process.env` directly elsewhere
— go through `SettingsDefaultsManager.get()`.

## Exit codes (hook contract)

- **0** — success or graceful degrade. Used for "worker unreachable, skip".
  Critical on Windows: non-zero exits make Windows Terminal accumulate tab
  errors.
- **1** — non-blocking error (stderr shown, session continues).
- **2** — blocking error (stderr fed back to Claude). Reserve for actual hook
  bugs, not infrastructure failures.

If a worker call fails with a network/5xx error, exit 0. If a handler hits a
TypeError, exit 2. See `src/shared/hook-constants.ts` (`HOOK_EXIT_CODES`).

## Tests

`bun test`. Layout under `tests/`:
- `tests/hook-*.test.ts` — handler / lifecycle / dispatch tests
- `tests/worker/`, `tests/services/`, `tests/sqlite/` — subsystem tests
- `tests/integration/` — end-to-end (worker boot, hook execution, Chroma sync)
- `tests/sdk/` — XML parser tests

Pre-existing failures from upstream are tracked in `ISSUE-BLOWOUT-TODO.md`. The
ones in `response-processor.test.ts` (3 failing) and
`settings-defaults-manager.test.ts` (3 failing on hardcoded `37777`) are NOT
regressions from the cleanup. Don't try to "fix" them by touching unrelated
code — confirm root cause first.

## Hot zones / known oddities

- `SessionStore.ts` (2.8k LOC), `SearchManager.ts` (2k LOC), and the three
  process-management implementations (`infrastructure/ProcessManager.ts` +
  `worker/ProcessRegistry.ts` + `supervisor/process-registry.ts`) total ~2k
  LOC of overlap. Top consolidation targets if you have license to refactor.
- `migrations.ts` + `migrations/runner.ts` together are ~1.6k LOC for a 10-row
  history. A `schema.sql` baseline + tiny runner could replace them, but
  existing user DBs would need a migration path.
- `worker-types.ts:PendingMessage` carries `tool_input`/`tool_response` fields
  that `ResponseProcessor` ignores in favor of the SDK text response. Captured
  but unused on the hot path.
- `ActiveSession.consecutiveRestarts` is deprecated — use `restartGuard`. Kept
  only for log compatibility.
- The MCP server (`src/servers/mcp-server.ts`) is bundled by `build-hooks.js`
  but not currently registered with any client in this fork. Don't delete it
  (Claude Desktop integration), but don't expand it either.
- `transcript-watcher` references and `CLAUDE_MEM_TRANSCRIPTS_ENABLED` setting
  are remnants — the watcher itself was removed in cleanup. The setting should
  probably go too.

## Privacy & safety

- `<private>...</private>` blocks in user prompts are stripped at the hook
  layer. Don't relax this. Don't introduce a "store everything" mode.
- The worker binds to loopback only. Never change `CLAUDE_MEM_WORKER_HOST`'s
  default away from `127.0.0.1`.
- Subagent identity (`agentId`/`agentType`) is capped at 128 chars in the
  Claude Code adapter to prevent DB bloat from runaway labels.

## Documentation

Public docs at `docs/public/` (Mintlify, deploys from `main`). The auto-generated
`CHANGELOG.md` in repo root — never edit by hand; `npm run changelog:generate`
owns it.
