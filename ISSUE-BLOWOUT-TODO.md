# Issue Blowout — Open Bug List

Branch: `claude/cleanup-codebase-XHXkz` (post-cleanup)
Originally tracked in PR #2079 cycle. **Trimmed to bugs that still apply
after the cleanup pass** that removed:
- Cursor / Gemini-CLI / OpenCode / OpenClaw / Windsurf / Codex CLI integrations
- Gemini and OpenRouter agents (Anthropic SDK only)
- Transcript watcher (Codex / Claude Desktop only)
- Telegram notifier
- Bedrock / Vertex / Azure auth paths
- Linux- and WSL-specific worker bugs (the user is on Windows 11)
- Endless Mode / beta channel
- All non-en-US locales

Remaining stack: Claude Code on Windows 11, Anthropic SDK, Chroma vector
search, smart-explore (tree-sitter), web viewer UI, the standard skill set.

## Test gate

After every `npm run build-and-sync`, verify observations are flowing:

```bash
sqlite3 ~/.claude-mem/claude-mem.db \
  "SELECT COUNT(*) FROM observations WHERE created_at_epoch > (strftime('%s','now') - 120) * 1000"
```

If the count is zero, that's a regression — fix it before continuing.

## Key files

- **Parser**: `src/sdk/parser.ts`
- **Prompts**: `src/sdk/prompts.ts`
- **ResponseProcessor**: `src/services/worker/agents/ResponseProcessor.ts`
- **SessionManager**: `src/services/worker/SessionManager.ts`
- **SessionSearch**: `src/services/sqlite/SessionSearch.ts`
- **SearchManager**: `src/services/worker/SearchManager.ts`
- **Worker**: `src/services/worker-service.ts`
- **Summarize hook**: `src/cli/handlers/summarize.ts`
- **SessionRoutes**: `src/services/worker/http/routes/SessionRoutes.ts`
- **ViewerRoutes**: `src/services/worker/http/routes/ViewerRoutes.ts`
- **SDK agent**: `src/services/worker/SDKAgent.ts`
- **Migrations**: `src/services/sqlite/migrations/runner.ts`
- **PendingMessageStore**: `src/services/sqlite/PendingMessageStore.ts`

---

## CRITICAL (4)

| # | Component | Issue |
|---|-----------|-------|
| 1925 | mcp | chroma-mcp subprocess leak via null-before-close |
| 1926 | mcp | chroma-mcp stdio handshake broken across all versions |
| 1880 | windows | Ghost LISTEN socket on port 37777 after crash |
| 1887 | windows | Failing worker blocks Claude Code MCP 10+ min in hook-restart loop |

## HIGH (24)

| # | Component | Issue |
|---|-----------|-------|
| 1869 | worker | No mid-session auto-restart after inner crash |
| 1870 | worker | Stop hook blocks ~110s when SDK pool saturated |
| 1871 | worker | generateContext opens fresh SessionStore per call |
| 1875 | worker | Spawns uvx/node/claude by bare name; silent fail in non-interactive |
| 1877 | worker | Cross-session context bleed in same project dir |
| 1879 | worker | Session completion races in-flight summarize |
| 1890 | sdk-pool | SDK session resume during summarize causes context-overflow |
| 1892 | sdk-pool | Memory agent prompt defeats cache (dynamic before static) |
| 1895 | hooks | Stop hook spins 110s when worker older than v12.1.0 |
| 1897 | hooks | PreToolUse:Read lacks PATH export and cache-path lookup |
| 1899 | hooks | SessionStart additionalContext >10KB truncated to 2KB |
| 1902 | hooks | Stop and PostToolUse hooks synchronously block up to 120s |
| 1904 | hooks | UserPromptSubmit hooks skipped in git worktree sessions |
| 1905 | hooks | Saved_hook_context entries pegs CPU 100% on session load |
| 1906 | hooks | PR #1229 fallback path points to source, not cache |
| 1921 | mcp | Root .mcp.json is empty, mcp-search never registers |
| 1922 | mcp | MCP server uses 3s timeout for corpus prime/query |
| 1929 | installer | "Update now" fails for cache-only installs |
| 1930 | installer | Windows 11 ships smart-explore without tree-sitter |
| 1937 | observer | JSONL files accumulate indefinitely, tens of GB |
| 1938 | observer | Observer background sessions burn tokens with no budget |
| 1939 | cross-platform | Project key uses basename(cwd), fragmenting worktrees |
| 1944 | auth | ANTHROPIC_AUTH_TOKEN not forwarded to SDK subprocess |
| 1952 | db | ON UPDATE CASCADE rewrites historical session attribution |
| 1954 | db | observation_feedback schema mismatch source vs compiled |
| 1958 | viewer | Settings model dropdown destroys precise model IDs |
| 1881-1888 | windows | 8 Windows-specific bugs (paths, spawning, timeouts) |

## MEDIUM (12)

| # | Component | Issue |
|---|-----------|-------|
| 1873 | worker | worker-service.cjs killed by SIGKILL (unbounded heap) |
| 1878 | worker | Logger caches log file path, never rotates |
| 1891 | sdk-pool | Mode prompts in user messages, not system prompt |
| 1893 | sdk-pool | SDK sub-agents hardcoded permissionMode:"default" |
| 1898 | hooks | SessionStart health-check uses hardcoded port 37777 |
| 1900 | hooks | Setup hook references non-existent scripts/setup.sh |
| 1910 | summarizer | Summary prompt leaks observation tags, ignores user_prompt |
| 1915 | search | Search results not deduplicated |
| 1917 | search | $CMEM context preview shows oldest instead of newest |
| 1920 | search | Context footer "ID" ambiguous across 3 ID spaces |
| 1923 | mcp | smart_outline empty for .txt files |
| 1924 | mcp | chroma-mcp child not terminated on exit |
| 1928 | installer | BranchManager.pullUpdates() fails on cache-layout |
| 1931 | installer | npm run worker:status ENOENT .claude/package.json |
| 1955 | db | Duplicate observations bypass content-hash dedup |
| 1959 | viewer | SSE new_prompt broadcast dies after /reload-plugins |

## LOW (1)

| # | Component | Issue |
|---|-----------|-------|
| 1919 | search | Shared jsts tree-sitter query applies TS-only to JS |

## NON-LABELED (1)

| # | Component | Issue |
|---|-----------|-------|
| 2054 | installer | installCLI version-pinned alias can't self-update |

---

## Removed from the original list (no longer applicable)

The following bugs were removed in the cleanup; they reference subsystems
that no longer exist in this fork:

| # | Reason removed |
|---|---|
| 1942 | Bedrock/Vertex/Azure auth — Anthropic SDK only now |
| 1943 | Bedrock auth — same |
| 1909 | Gemini transcript recognition — no Gemini |
| 1941 | Linux worker recovery — Windows 11 only |
| 1945 | Vertex AI OAuth — no Vertex |
| 1947 | OpenCode tool args — no OpenCode |
| 1948-1950 | OpenClaw installer/isolation/skills — no OpenClaw |
| 1951 | OpenClaw lifecycle events — no OpenClaw |
| 1872 | Gemini crash-recovery loop — no Gemini |
| 1894 | `~/.local/bin` (POSIX path) — Windows 11 only |
| 1927 | chroma-mcp on WSL — Windows 11 native |
| 1940 | cmux.app wrapper — non-Claude-Code wrapper |
| 1946 | OpenRouter 401 — no OpenRouter |
| 1960 | OpenRouter URL hardcoded — same |
| 1961 | Traditional → Simplified Chinese fallback — en-US only |

## Suggested next attack order

### Phase 1: Windows stability
- #1880, #1887, #1881-1888 (the 8 Windows-specific bugs), #1930 (smart-explore)

### Phase 2: Chroma / MCP
- #1925, #1926, #1924, #1922, #1923, #1921

### Phase 3: Hooks reliability
- #1895, #1897, #1899, #1902, #1904, #1905, #1906, #1898, #1900

### Phase 4: Worker / SDK pool
- #1869, #1870, #1871, #1875, #1877, #1879, #1890, #1892, #1873, #1878,
  #1891, #1893

### Phase 5: Database / observation hygiene
- #1937, #1938, #1952, #1954, #1955, #1939, #1944

### Phase 6: Search and viewer polish
- #1915, #1917, #1920, #1958, #1959, #1910, #1919

### Phase 7: Installer
- #1929, #1928, #1931, #2054
