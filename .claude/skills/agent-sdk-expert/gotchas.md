# Claude Agent SDK — Gotchas

1. **No default system prompt.** SDK ships minimal prompt. Use `systemPrompt: { type: "preset", preset: "claude_code" }` for full Claude Code behavior.

2. **No filesystem settings by default.** `settingSources` defaults to `[]`. Must explicitly set `["project"]` to load CLAUDE.md, skills, slash commands.

3. **Custom MCP tools require streaming input.** You must use an async generator for `prompt`, not a plain string, when using `mcpServers`.

4. **`Task` must be in `allowedTools`** for subagents to work. Subagents are invoked via the Task tool.

5. **Subagents cannot spawn subagents.** Don't include `Task` in a subagent's `tools` array.

6. **`bypassPermissions` requires `allowDangerouslySkipPermissions: true`** and propagates irrevocably to all subagents.

7. **Hook deny overrides allow.** If any hook returns deny, the operation is blocked regardless of other hooks.

8. **`updatedInput` in hooks requires `permissionDecision: "allow"`** to take effect.

9. **Windows: long subagent prompts may fail** due to 8191-char command line limit.

10. **Session forking only in V1**, not available in V2 preview.

11. **SDK spawns Claude Code as subprocess.** Requires CLI to be installed (bundled with npm package). Override with `pathToClaudeCodeExecutable`.

12. **Version parity:** SDK versions track Claude Code (e.g., SDK 0.2.39 = Claude Code v2.1.39).

13. **MCP tool naming:** `mcp__<server-name>__<tool-name>`. Use this format in `allowedTools`.

14. **Skills require filesystem artifacts** (`.claude/skills/SKILL.md`). Cannot be defined programmatically. Need `"Skill"` in `allowedTools` and `settingSources: ["project"]`.

15. **Permission evaluation order:** Hooks → deny → allow → ask → permissionMode → canUseTool.

16. **Query object has control methods.** The `query()` return value has methods like `interrupt()`, `rewindFiles()`, `setModel()`, `setPermissionMode()`. Capture the query object if you need runtime control.
