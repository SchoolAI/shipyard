# Platform Detection Implementation - Complete

**Status:** ✅ All checks passing, committed to branch 38-naming (commit 5981780)

---

## What Was Fixed

### 1. Dynamic Platform Detection
- Created `apps/server/src/platform-detection.ts` module
- Detects platform from MCP clientInfo (primary) or environment variables (fallback)
- Captures clientInfo on first tool call (after MCP handshake completes)
- Stores clientInfo in `apps/server/src/mcp-client-info.ts` global

### 2. Unified Platform Lists (Single Source of Truth)
**All platform data now lives in `packages/schema/src/plan.ts`:**
- `OriginPlatformValues` - Array of all 11 supported platforms
- `PLATFORM_DISPLAY_NAMES` - Display names for UI (e.g., "Claude Code", "Codex")
- `MCP_CLIENT_INFO_MAP` - Maps MCP clientInfo.name to platform
- `AGENT_PLATFORMS` - List of agent platforms (vs browsers)
- `isAgentPlatform()` - Helper to check if platform is an agent
- `getPlatformDisplayName()` - Type-safe display name lookup

**Removed duplicate lists from:**
- `apps/server/src/platform-detection.ts` (now imports from schema)
- `apps/web/src/components/PlanHeader.tsx` (now imports from schema)

### 3. Supported Platforms (11 total)
1. `aider` - Aider CLI
2. `claude-code` - Claude Code
3. `cline` - Cline (VS Code extension)
4. `codex` - Codex CLI
5. `continue` - Continue
6. `cursor` - Cursor
7. `devin` - Devin
8. `vscode` - VS Code
9. `windsurf` - Windsurf
10. `zed` - Zed
11. `unknown` - Fallback

**No more assumptions** - each platform gets its own value (Codex ≠ Aider, Cline ≠ Cursor, etc.)

### 4. mcpmon Hot Reload Fix
- Fixed `.mcp.json` and `.codex/config.toml` to watch **directory** not file
- Reason: tsup's `clean: true` deletes dist/ before rebuilding, orphaning file watchers
- Now: watches `apps/server/dist/` directory instead of `apps/server/dist/index.js`
- Result: mcpmon properly detects rebuilds and restarts MCP server

### 5. dev:all Script Fix
- Added server build step before starting services
- Ensures `apps/server/dist/index.js` exists before mcpmon starts watching
- Prevents "file not found" errors in new worktrees

### 6. Code Quality Fixes
- Converted platform-detection tests to proper Vitest format (no console.log)
- Refactored `detectPlatformFromEnvironment()` to reduce complexity (18 → under 15)
- Removed all "what" comments (kept only "why" comments)
- Removed type assertions (added type-safe helper functions)
- All checks passing: test, typecheck, lint, comment style, type assertions

---

## How It Works

### Detection Flow

```
1. Agent calls MCP tool (e.g., postUpdate, readTask)
   ↓
2. Server captures clientInfo from handshake:
   - Claude Code sends: "claude-code"
   - Codex sends: "codex-mcp-client" or "Codex"
   - Cursor sends: "cursor-vscode"
   ↓
3. detectPlatform(clientInfoName) runs:
   - Lookup in MCP_CLIENT_INFO_MAP
   - Falls back to environment variables if not found
   - Defaults to 'unknown' if nothing detected
   ↓
4. Platform stored and used for:
   - Awareness state (WebRTC peer presence)
   - Display name (e.g., "Codex (username)")
   - Origin metadata (for conversation export)
```

### Server Logs (What You'll See)

```json
{"clientName":"claude-code","clientVersion":"2.1.20","msg":"MCP client info captured from tool call"}
{"platform":"claude-code","username":"jacob-petterle","msg":"MCP awareness state set"}
```

When Codex connects:
```json
{"clientName":"codex-mcp-client","msg":"MCP client info captured from tool call"}
{"platform":"codex","username":"jacob-petterle","msg":"MCP awareness state set"}
```

---

## Testing Instructions

### For Codex Agent

**Task credentials:**
- Task ID: `TlK3diYNTZAJbI5jBTMpY`
- Session Token: `Q-aeVuGVRGmDj1jHvmQ_GJoQMDVUz0RvJrIZIcU20jM`
- URL: http://localhost:5173/task/TlK3diYNTZAJbI5jBTMpY

**Simple test code:**
```typescript
await postUpdate({
  taskId: "TlK3diYNTZAJbI5jBTMpY",
  sessionToken: "Q-aeVuGVRGmDj1jHvmQ_GJoQMDVUz0RvJrIZIcU20jM",
  message: "Codex agent testing platform detection"
});
```

**Expected results:**

1. **Server logs** should show:
   ```json
   {"clientName":"codex-mcp-client","msg":"MCP client info captured"}
   {"platform":"codex","msg":"MCP awareness state set"}
   ```

2. **Browser UI** at http://localhost:5173/task/TlK3diYNTZAJbI5jBTMpY should show:
   - 🤖 **Agents:** Codex (jacob-petterle), Claude Code (jacob-petterle)
   - (Both listed separately under "agents", NOT under "browsers")

3. **Activity timeline** should show:
   - "Codex agent testing platform detection" update

---

## Current Service Status (as of 01:43 AM)

✅ **Vite:** http://localhost:5173 (PID 55881, 27781)
✅ **Registry Hub:** localhost:32191 (PID 13810)
✅ **Signaling:** localhost:4444 (PID 70363)
✅ **MCP Servers:** Multiple instances via mcpmon (PIDs 30145, 61500)

**All running from:** `/Users/jacobpetterle/Working Directory/shipyard-wt/38-naming/`

---

## Files Changed (14 total)

### New Files
- `apps/server/src/mcp-client-info.ts` - Global storage for MCP clientInfo
- `apps/server/src/platform-detection.ts` - Core detection module (161 lines)
- `apps/server/src/platform-detection.test.ts` - Vitest tests (27 tests, all passing)

### Modified Files
- `.codex/config.toml` - Fixed mcpmon watch (directory not file)
- `.mcp.json.example` - Fixed mcpmon watch (directory not file)
- `apps/server/src/hook-api.ts` - Removed unused detectPlatform import
- `apps/server/src/index.ts` - Captures clientInfo on tool call
- `apps/server/src/tools/create-task.ts` - Updated OriginPlatformEnum with all platforms
- `apps/server/src/webrtc-provider.ts` - Uses detected platform for awareness
- `apps/web/src/components/PlanHeader.tsx` - Uses getPlatformDisplayName helper
- `apps/web/src/hooks/useBroadcastApprovalStatus.ts` - Keeps platform omitted for browsers
- `packages/schema/src/index.ts` - Exports new platform constants and helpers
- `packages/schema/src/plan.ts` - Unified platform lists (single source of truth)
- `scripts/dev-all.sh` - Builds server before starting services

---

## Verification Checklist

- ✅ All builds successful
- ✅ All tests passing (433 tests total)
- ✅ TypeScript clean (no errors)
- ✅ Biome lint clean
- ✅ Comment style clean (no "what" comments)
- ✅ Type assertions clean (no `as` casts except `as const` and `as never`)
- ✅ Services running on correct ports from 38-naming worktree
- ✅ Platform detection working for Claude Code
- ⏳ **NEEDS TESTING:** Codex platform detection

---

## Known Issues: None

Everything is working as designed. The only remaining item is to test with Codex to verify:
1. Codex shows as "Codex" agent (not "Aider" or "Agent" or browser)
2. Both Claude Code and Codex appear in the agents list simultaneously
3. Display names show usernames correctly

---

## Next Steps for Morning

1. **Test with Codex** using the credentials above
2. If Codex shows correctly as agent → **Ship it!**
3. If any issues → check server logs for clientInfo/platform values

**Monitor with:**
```bash
tail -f ~/.shipyard/server-debug.log | grep -E "clientName|platform.*awareness"
```

---

*Generated: 2026-01-27 01:43 AM*
