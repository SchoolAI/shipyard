---
name: agent-sdk-expert
description: "Expert at the Claude Agent SDK (@anthropic-ai/claude-agent-sdk). Use when building programmatic agents, configuring tools/permissions/hooks, defining subagents, setting up MCP servers, managing sessions, or using the V2 session API."
---

# Claude Agent SDK Expert

## Overview

The Claude Agent SDK lets you programmatically build AI agents with the same capabilities as Claude Code. It wraps Claude Code as a subprocess and streams messages via JSON. Install: `npm install @anthropic-ai/claude-agent-sdk`

## Quick Reference: query()

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const msg of query({
  prompt: "Find and fix the bug in auth.py",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    permissionMode: "acceptEdits",
    systemPrompt: "You are a senior developer.",
    agents: { /* subagent definitions */ },
    mcpServers: { /* MCP server configs */ },
    hooks: { /* lifecycle hooks */ },
    resume: "session-id",          // Resume prior session
    settingSources: ["project"],   // Load CLAUDE.md, skills, etc.
    model: "claude-opus-4-6",
    maxTurns: 10,
    maxBudgetUsd: 1.0,
  }
})) {
  if ("result" in msg) console.log(msg.result);
}
```

## Quick Reference: Subagents

```typescript
agents: {
  "code-reviewer": {
    description: "Expert code reviewer.",       // When to use
    prompt: "Review code for quality...",        // System prompt
    tools: ["Read", "Grep", "Glob"],            // Tool restrictions
    model: "sonnet",                            // Model override
  }
}
// IMPORTANT: Include "Task" in allowedTools for subagents to work
```

## Quick Reference: Custom MCP Tools

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const server = createSdkMcpServer({
  name: "my-tools",
  tools: [
    tool("get_weather", "Get weather", { city: z.string() }, async (args) => ({
      content: [{ type: "text", text: `Weather in ${args.city}: sunny` }]
    }))
  ]
});
// Use: options: { mcpServers: { "my-tools": server } }
```

## Quick Reference: V2 Preview API

```typescript
import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";

// One-shot (no session needed)
const result = await unstable_v2_prompt("What is 2+2?", { model: "claude-opus-4-6" });
```

```typescript
import { unstable_v2_createSession, unstable_v2_resumeSession } from "@anthropic-ai/claude-agent-sdk";

await using session = unstable_v2_createSession({ model: "claude-opus-4-6" });
await session.send("Hello!");
for await (const msg of session.stream()) { /* process */ }

// Resume later
await using resumed = unstable_v2_resumeSession(sessionId, { model: "claude-opus-4-6" });
```

## Permission Modes

| Mode | Behavior |
|------|----------|
| `default` | Requires canUseTool callback |
| `acceptEdits` | Auto-approves file edits |
| `bypassPermissions` | No prompts (requires `allowDangerouslySkipPermissions: true`) |
| `plan` | Plan mode |

## Built-in Tools

Read, Write, Edit, Bash, BashOutput, KillBash, Glob, Grep, WebSearch, WebFetch, Task, AskUserQuestion, Skill, ListMcpResources, ReadMcpResource

## Further Reading

- [reference.md](./reference.md) — Full API reference
- [gotchas.md](./gotchas.md) — Critical pitfalls
- Local repo: `/Users/jacobpetterle/Working Directory/claude-agent-sdk-typescript/`
- Docs: https://platform.claude.com/docs/en/agent-sdk/overview
