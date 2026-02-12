---
name: a2a-protocol-expert
description: "Expert at the Agent-to-Agent (A2A) protocol and @a2a-js/sdk. Use when implementing A2A servers or clients, handling agent cards, task lifecycle, message passing, streaming, push notifications, or multi-agent communication."
---

# A2A Protocol Expert

## Overview

Agent-to-Agent (A2A) is an open protocol enabling communication between opaque AI agents. Unlike MCP (which exposes tools), A2A treats agents as peers that collaborate without sharing internal state.

- **Wire format**: JSON-RPC 2.0 over HTTP(S), SSE for streaming, gRPC optional
- **Agent Card discovery**: `GET /.well-known/agent-card.json`
- **JS SDK**: `@a2a-js/sdk` (separate client/server imports)

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Agent Card** | JSON manifest describing identity, capabilities, skills, auth, endpoints |
| **Message** | Communication turn (`role: "user" \| "agent"`) with `Part[]` |
| **Task** | Stateful unit of work with lifecycle, history, artifacts |
| **Part** | Content: `TextPart`, `FilePart`, or `DataPart` |
| **Artifact** | Output generated during task execution |
| **Context** | Groups related tasks/messages |

## Task Lifecycle

```
submitted → working → completed / failed / canceled / rejected
                   → input-required (multi-turn)
                   → auth-required
```

## Server Pattern (5 Steps)

```typescript
import { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus, DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler } from "@a2a-js/sdk/server/express";

// 1. Define agent card
const card: AgentCard = { name: "My Agent", url: "...", protocolVersion: "0.3.0", ... };

// 2. Implement executor
class MyExecutor implements AgentExecutor {
  async execute(ctx: RequestContext, bus: ExecutionEventBus) {
    bus.publish({ kind: "message", role: "agent", parts: [{ kind: "text", text: "Hello" }], ... });
    bus.finished();  // REQUIRED
  }
  cancelTask = async () => {};
}

// 3. Wire handler
const handler = new DefaultRequestHandler(card, new InMemoryTaskStore(), new MyExecutor());

// 4-5. Mount routes
app.use("/.well-known/agent-card.json", agentCardHandler({ agentCardProvider: handler }));
app.use("/a2a/jsonrpc", jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));
```

## Client Pattern

```typescript
import { ClientFactory } from "@a2a-js/sdk/client";

const client = await new ClientFactory().createFromUrl("http://localhost:4000");

// Simple send
const result = await client.sendMessage({ message: { kind: "message", role: "user", parts: [...] } });

// Streaming
for await (const event of client.sendMessageStream({ message: { ... } })) {
  switch (event.kind) {
    case "task": /* initial */ break;
    case "status-update": /* progress */ break;
    case "artifact-update": /* results */ break;
  }
}
```

## Further Reading

- [reference.md](./reference.md) — Full API reference
- [gotchas.md](./gotchas.md) — Common pitfalls
- Spec: `/Users/jacobpetterle/Working Directory/A2A/`
- JS SDK: `/Users/jacobpetterle/Working Directory/a2a-js/`
