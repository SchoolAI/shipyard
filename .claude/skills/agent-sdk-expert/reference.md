# Claude Agent SDK — Full Reference

## query() Options

| Option | Type | Default | Description |
|---|---|---|---|
| `allowedTools` | `string[]` | all | Tool allowlist |
| `disallowedTools` | `string[]` | none | Tool blocklist |
| `permissionMode` | `string` | `"default"` | `default`, `acceptEdits`, `bypassPermissions`, `plan` |
| `allowDangerouslySkipPermissions` | `boolean` | false | Required with bypassPermissions |
| `systemPrompt` | `string \| preset` | minimal | Use `{ type: "preset", preset: "claude_code" }` for full |
| `settingSources` | `string[]` | `[]` | `["user", "project", "local"]` to load filesystem config |
| `agents` | `Record<string, AgentDef>` | none | Subagent definitions |
| `mcpServers` | `Record<string, config>` | none | MCP server connections |
| `hooks` | `Record<event, matcher[]>` | none | Lifecycle callbacks |
| `resume` | `string` | none | Session ID to resume |
| `forkSession` | `boolean` | false | Fork instead of continue when resuming |
| `cwd` | `string` | process.cwd() | Working directory |
| `model` | `string` | default | Model to use |
| `maxTurns` | `number` | none | Max conversation turns |
| `maxBudgetUsd` | `number` | none | Budget cap |
| `maxThinkingTokens` | `number` | none | Thinking budget |
| `outputFormat` | `{ type, schema }` | none | Structured JSON output |
| `includePartialMessages` | `boolean` | false | Stream partial messages |
| `env` | `Dict<string>` | none | Environment variables |
| `canUseTool` | `function` | none | Custom permission callback |
| `additionalDirectories` | `string[]` | none | Extra directories to access |
| `continue` | `boolean` | false | Continue most recent conversation |
| `enableFileCheckpointing` | `boolean` | false | Track file changes for rewinding |
| `pathToClaudeCodeExecutable` | `string` | bundled | Override CLI path |
| `sandbox` | `object` | none | Sandbox configuration |

## Message Types (SDKMessage)

| Type | Subtype | Key Fields | When |
|---|---|---|---|
| `system` | `init` | `session_id, tools, model` | First message |
| `assistant` | — | `message` (Anthropic API format) | Claude responses |
| `user` | — | `message` | User inputs |
| `result` | `success` | `result, total_cost_usd, duration_ms` | Done |
| `result` | `error_*` | `errors` | Failed |

## Built-in Tools

Read, Write, Edit, Bash, BashOutput, KillBash, Glob, Grep, WebSearch, WebFetch, Task, AskUserQuestion, Skill, EnterPlanMode, ExitPlanMode, TodoWrite, NotebookEdit, ListMcpResources, ReadMcpResource

## Permission Evaluation Order

Hooks → deny rules → allow rules → ask rules → permission mode → canUseTool callback

## Hooks

Events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Notification`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`

```ts
hooks: {
  PreToolUse: [{
    matcher: "Write|Edit",
    hooks: [async (input) => {
      if (input.tool_input?.file_path?.includes(".env"))
        return { hookSpecificOutput: { hookEventName: input.hook_event_name,
          permissionDecision: "deny", permissionDecisionReason: "Protected" } };
      return {};
    }]
  }]
}
```

## Subagents (AgentDefinition)

| Field | Required | Description |
|---|---|---|
| `description` | Yes | When to use (Claude matches tasks) |
| `prompt` | Yes | System prompt for the agent |
| `tools` | No | Tool allowlist (inherits all if omitted) |
| `model` | No | `"sonnet"`, `"opus"`, `"haiku"`, `"inherit"` |

Subagents cannot spawn subagents (no `Task` in their tools).

## Sessions

```ts
// Capture session ID
if (msg.type === "system" && msg.subtype === "init") sessionId = msg.session_id;

// Resume
query({ prompt: "Continue...", options: { resume: sessionId } })

// Fork (new branch from same point)
query({ prompt: "Try different approach...", options: { resume: sessionId, forkSession: true } })
```

## Custom MCP Tools

```ts
const server = createSdkMcpServer({
  name: "my-tools",
  tools: [tool("name", "description", zodSchema, handler)]
});

// MUST use streaming input with MCP
async function* input() {
  yield { type: "user", message: { role: "user", content: "prompt" } };
}
query({ prompt: input(), options: { mcpServers: { "my-tools": server } } })
```

## V2 Preview

```ts
// One-shot
const result = await unstable_v2_prompt("What is 2+2?", { model: "claude-opus-4-6" });

// Session
await using session = unstable_v2_createSession({ model: "claude-opus-4-6" });
await session.send("Hello");
for await (const msg of session.stream()) { /* ... */ }

// Resume
await using resumed = unstable_v2_resumeSession(sessionId, { model: "claude-opus-4-6" });
```
