# Plugin Development Guide

Notes for maintainers working on the Shipyard Claude Code plugin.

## Plugin Structure

```
.claude-plugin/
├── plugin.json          # Plugin manifest (MUST declare all components)
├── mcp.json             # MCP server configuration
hooks/
├── hooks.json           # Hook definitions
apps/hook/
├── dist/index.js        # Built hook binary (MUST be committed)
├── src/                 # TypeScript source
└── tsup.config.ts       # Build configuration
skills/
└── shipyard/
    └── SKILL.md         # Skill instructions
```

## Gotchas

### 1. Hooks Must Be Declared in plugin.json

Claude Code does NOT auto-discover hooks. You must explicitly declare them:

```json
{
  "skills": "./skills/",
  "mcpServers": "./.mcp-plugin.json",
  "hooks": "./hooks/hooks.json"  // ← REQUIRED or hooks silently ignored
}
```

**Symptom:** Hooks exist in `hooks/hooks.json` but never fire.

**Fix:** Add `"hooks": "./hooks/hooks.json"` to `.claude-plugin/plugin.json`.

### 2. Built Artifacts Must Be Committed

Claude Code plugins don't support `postInstall` scripts (tracked in [#9394](https://github.com/anthropics/claude-code/issues/9394), [#11240](https://github.com/anthropics/claude-code/issues/11240)).

This means:
- `apps/hook/dist/` must be in git (not gitignored)
- After changing hook source, rebuild AND commit: `pnpm --filter @shipyard/hook build`

**Symptom:** Plugin installs but hooks fail with "Cannot find module".

**Fix:** Ensure `.gitignore` has `!apps/hook/dist/` exception, commit built files.

### 3. pino Requires CJS Build Format

pino uses internal dynamic `require()` calls that break in ESM bundles:

```
Error: Dynamic require of "os" is not supported
```

**Symptom:** Hook crashes immediately when invoked.

**Fix:** Build as CommonJS in `tsup.config.ts`:

```typescript
export default defineConfig({
  format: ['cjs'],  // NOT 'esm' - pino breaks
  outExtension: () => ({ js: '.js' }),  // Force .js extension
  // ...
});
```

Also remove `"type": "module"` from `apps/hook/package.json`.

### 4. Hook Response Format for PreToolUse Deny

To block a tool, output this JSON to stdout with exit code 0:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Your reason here"
  }
}
```

**Symptom:** Hook runs, logs blocking message, but tool still executes.

**Fix:** Ensure JSON is on stdout (not stderr), exit code is 0, format matches exactly.

## Testing Hooks Locally

Test hook directly without Claude Code:

```bash
# Test PreToolUse for AskUserQuestion
echo '{"session_id":"test","hook_event_name":"PreToolUse","tool_name":"AskUserQuestion","permission_mode":"default"}' | node apps/hook/dist/index.js

# Expected output (stderr = log, stdout = response):
# {"level":30,...,"msg":"Blocking AskUserQuestion..."}
# {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",...}}
```

## Rebuilding and Releasing

After changing hook code:

```bash
# 1. Rebuild
pnpm --filter @shipyard/hook build

# 2. Test locally
echo '...' | node apps/hook/dist/index.js

# 3. Commit (includes dist/)
git add apps/hook/dist/ apps/hook/src/
git commit -m "fix: hook changes"
git push

# 4. Users reinstall plugin to get update
# /plugin uninstall shipyard
# /plugin install SchoolAI/shipyard
```

## Debugging

Hook logs go to `~/.shipyard/hook-debug.log`:

```bash
# Watch logs in real-time
tail -f ~/.shipyard/hook-debug.log

# Search for specific events
grep "AskUserQuestion\|ExitPlanMode" ~/.shipyard/hook-debug.log
```

## References

- [Claude Code Hooks Docs](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Claude Code Plugins Docs](https://docs.anthropic.com/en/docs/claude-code/plugins)
- GitHub Issues: [#9394](https://github.com/anthropics/claude-code/issues/9394) (postInstall), [#11240](https://github.com/anthropics/claude-code/issues/11240) (lifecycle hooks)

---

*Last updated: 2026-01-21*
