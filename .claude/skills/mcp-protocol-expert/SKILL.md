---
name: mcp-protocol-expert
description: "Expert at the Model Context Protocol (MCP) and @modelcontextprotocol/sdk. Use when building MCP servers or clients, defining tools/resources/prompts, handling transports (stdio/Streamable HTTP), capability negotiation, sampling, elicitation, tasks, or any MCP integration."
---

# MCP Protocol Expert

## Overview

The Model Context Protocol (MCP) is an open protocol for seamless integration between LLM applications and external data sources/tools. It uses JSON-RPC 2.0 over stdio or Streamable HTTP. **Protocol version: 2025-11-25.**

- **Hosts**: LLM applications that initiate connections
- **Clients**: Connectors within the host (1:1 with servers)
- **Servers**: Services providing context and capabilities
- **SDK**: `@modelcontextprotocol/sdk` (TypeScript)

## Quick Reference: Server Features

| Feature | Capability | Methods |
|---------|-----------|---------|
| **Tools** | `tools` | `tools/list`, `tools/call` |
| **Resources** | `resources` | `resources/list`, `resources/read`, `resources/subscribe` |
| **Prompts** | `prompts` | `prompts/list`, `prompts/get` |
| **Logging** | `logging` | `logging/setLevel`, `notifications/message` |
| **Completions** | `completions` | `completion/complete` |

## Quick Reference: Client Features

| Feature | Capability | Methods |
|---------|-----------|---------|
| **Sampling** | `sampling` | `sampling/createMessage` |
| **Roots** | `roots` | `roots/list` |
| **Elicitation** | `elicitation` | `elicitation/create` (form or url mode) |

## Quick Reference: Lifecycle

```
Client                          Server
  │                               │
  │──── initialize ──────────────►│  (capabilities + version)
  │◄─── InitializeResult ────────│  (capabilities + version)
  │──── notifications/initialized►│
  │                               │
  │     ══ Operation Phase ══     │
  │                               │
  │──── disconnect ──────────────►│
```

## Quick Reference: Tool Definition

```typescript
// Server exposes tools
const tool = {
  name: "get_weather",
  title: "Weather Provider",
  description: "Get weather for a location",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City name" }
    },
    required: ["location"]
  },
  outputSchema: {  // optional structured output
    type: "object",
    properties: {
      temperature: { type: "number" },
      conditions: { type: "string" }
    },
    required: ["temperature", "conditions"]
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  }
};
```

## Quick Reference: Tool Result

```typescript
// Unstructured result
{ content: [{ type: "text", text: "72°F, Partly cloudy" }], isError: false }

// Structured result (with outputSchema)
{
  content: [{ type: "text", text: '{"temperature":22.5,"conditions":"Partly cloudy"}' }],
  structuredContent: { temperature: 22.5, conditions: "Partly cloudy" },
  isError: false
}

// Error result (tool execution error — NOT protocol error)
{ content: [{ type: "text", text: "API rate limit exceeded" }], isError: true }
```

## Quick Reference: Content Types

| Type | Fields | Usage |
|------|--------|-------|
| `TextContent` | `type: "text"`, `text` | Text messages |
| `ImageContent` | `type: "image"`, `data` (base64), `mimeType` | Images |
| `AudioContent` | `type: "audio"`, `data` (base64), `mimeType` | Audio |
| `ResourceLink` | `type: "resource_link"`, `uri`, `name` | Links to resources |
| `EmbeddedResource` | `type: "resource"`, `resource` | Inline resource data |

## Quick Reference: Transports

**stdio** — Client launches server as subprocess. Messages on stdin/stdout, newline-delimited. Logs on stderr.

**Streamable HTTP** — Server exposes single MCP endpoint. Client POSTs JSON-RPC, server responds with `application/json` or `text/event-stream` (SSE). Session management via `MCP-Session-Id` header. Client GETs for server-initiated messages.

## Quick Reference: Sampling (Server → Client)

```json
{
  "method": "sampling/createMessage",
  "params": {
    "messages": [{ "role": "user", "content": { "type": "text", "text": "..." } }],
    "modelPreferences": {
      "hints": [{ "name": "claude-3-sonnet" }],
      "intelligencePriority": 0.8,
      "speedPriority": 0.5
    },
    "systemPrompt": "You are helpful.",
    "maxTokens": 100,
    "tools": [],
    "toolChoice": { "mode": "auto" }
  }
}
```

## Quick Reference: Tasks (Experimental)

Tasks wrap requests for async/deferred execution with polling.

```
tools/call + task:{ttl:60000} → CreateTaskResult (taskId, status:"working")
tasks/get (taskId)            → Task (status:"working"|"completed"|"failed"|...)
tasks/result (taskId)         → Original result (e.g. CallToolResult)
tasks/cancel (taskId)         → Task (status:"cancelled")
```

Status lifecycle: `working` → `input_required` | `completed` | `failed` | `cancelled`

## Error Codes

| Code | Name |
|------|------|
| -32700 | Parse error |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32042 | URL elicitation required |

## Further Reading

- [reference.md](./reference.md) — Full API reference with all types
- [gotchas.md](./gotchas.md) — Critical pitfalls
- MCP Spec (local): `/Users/jacobpetterle/Working Directory/mcp-specification/`
  - **If this directory does not exist, clone it first:** `git clone https://github.com/modelcontextprotocol/specification.git "/Users/jacobpetterle/Working Directory/mcp-specification"`
- MCP TypeScript SDK (local): `/Users/jacobpetterle/Working Directory/mcp-typescript-sdk/`
  - **If this directory does not exist, clone it first:** `git clone https://github.com/modelcontextprotocol/typescript-sdk.git "/Users/jacobpetterle/Working Directory/mcp-typescript-sdk"`
- Schema: `/Users/jacobpetterle/Working Directory/mcp-specification/schema/2025-11-25/schema.ts`
- Spec site: https://modelcontextprotocol.io/specification/2025-11-25
