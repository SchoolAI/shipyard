# A2A Integration Research

**Created:** 2026-02-14
**Status:** Research Complete — Implementation Deferred
**Scope:** A2A protocol research, MCP-aligned internal schema decision, future A2A integration architecture

---

## Executive Summary

This WHIP documents our research into the Agent-to-Agent (A2A) protocol and how it relates to Shipyard's internal architecture. The key finding: Shipyard's internal CRDT schema should model after **MCP** (tool-calling fidelity), not A2A (opaque messaging). A2A becomes a future **projection layer** that filters internal messages down to text-only for the wire format. This approach preserves full tool-call observability for the task owner while remaining A2A-compatible for inter-agent communication.

---

## 1. Protocol Landscape

Shipyard sits at the intersection of three protocol layers, each serving a distinct purpose:

```
┌─────────────────────────────────────────────────────────────────┐
│  A2A (Agent-to-Agent)                                           │
│  Inter-agent communication, opaque by design                    │
│  Parts: text, file, data  │  Discriminator: `kind`             │
│  Package: @a2a-js/sdk                                           │
├─────────────────────────────────────────────────────────────────┤
│  MCP (Model Context Protocol)                                   │
│  Agent-to-tool communication, first-class tool calling          │
│  Content: text, image, audio, resource_link, resource           │
│  Discriminator: `type`                                          │
│  Package: @modelcontextprotocol/sdk                             │
├─────────────────────────────────────────────────────────────────┤
│  Claude Agent SDK                                               │
│  Internal LLM session management, streams SDKMessage            │
│  Blocks: text, tool_use, tool_result, thinking,                 │
│          server_tool_use, web_search_tool_result,               │
│          redacted_thinking                                      │
│  Package: @anthropic-ai/claude-agent-sdk                        │
└─────────────────────────────────────────────────────────────────┘
```

### How They Relate

| Protocol | Scope | Tool Calls | Content Discriminator |
|----------|-------|------------|----------------------|
| **A2A** | Between agents (different vendors/frameworks) | Hidden — opaque execution principle | `kind` on Part |
| **MCP** | Agent to tools (same trust boundary) | First-class: `CallToolRequest` + `CallToolResult` | `type` on Content |
| **Claude Agent SDK** | LLM to host (internal session) | `tool_use` / `tool_result` blocks | `type` on ContentBlock |

**A2A** intentionally hides tool calls. Messages contain only `TextPart`, `FilePart`, and `DataPart`. There are no `tool_use` or `tool_result` part types. This is a design principle, not an oversight.

**MCP** has first-class tool calling. `CallToolRequest` carries `name` + `arguments`, and `CallToolResult` carries `content[]` + `isError` + `structuredContent`. Content blocks are discriminated by `type`: text, image, audio, resource_link, resource. MCP also provides `ToolAnnotations` (destructiveHint, readOnlyHint, openWorldHint, idempotentHint) and `ProgressNotification` for long-running tool calls.

**Claude Agent SDK** streams `SDKMessage` objects containing assistant messages with content blocks: text, tool_use, tool_result, thinking, server_tool_use, web_search_tool_result, and redacted_thinking. These map naturally to MCP's tool-calling model.

---

## 2. Key Decision: MCP-aligned Internal Schema

### Why MCP, Not A2A

Shipyard's internal CRDT schema (`TaskDocumentSchema` in `packages/loro-schema`) models after MCP's content block types rather than A2A's part types.

**Rationale:**

1. **A2A intentionally hides tool calls.** A2A's opaque execution principle means tool_use/tool_result never appear in A2A messages. But Shipyard's core value is *observability* — task owners need to see what their agents are doing, including tool calls.

2. **MCP has first-class tool calling.** MCP's `CallToolRequest` (name + arguments) and `CallToolResult` (content[] + isError) map directly to what the Claude Agent SDK emits as `tool_use` and `tool_result` content blocks.

3. **A2A is a projection, not the source of truth.** When Shipyard eventually supports A2A for inter-agent communication, the A2A conversation will be a filtered view: strip tool_use/tool_result blocks, keep only text content, and emit as A2A TextParts. This is a lossy but correct transformation.

4. **Type-safe verification.** Loro's `Infer<typeof Shape>` produces plain TypeScript types compatible with `satisfies`, so we can verify MCP conformance at compile time without runtime overhead.

### Current Implementation

The schema already reflects this decision:

```typescript
// packages/loro-schema/src/shapes.ts
const CONTENT_BLOCK_TYPES = [
  'text', 'tool_use', 'tool_result', 'thinking',
  'server_tool_use', 'web_search_tool_result', 'redacted_thinking',
] as const;

const ContentBlockShape = Shape.plain.struct({
  type: Shape.plain.string(...CONTENT_BLOCK_TYPES),
  // ... block-specific fields
});
```

These types come from the Claude Agent SDK, not A2A. The A2A `TextPart` / `FilePart` / `DataPart` types are deliberately absent from the internal schema.

---

## 3. A2A Research Findings

### 3.1. Official Position on Tool Calls

From the A2A specification (RC v1.0, Section 1.2):

> **Opaque Execution:** Agents collaborate based on declared capabilities and exchanged information, **without needing to share their internal thoughts, plans, or tool implementations.**

From the introduction (Section 1):

> Enable agents to [...] securely exchange information to achieve user goals **without needing access to each other's internal state, memory, or tools.**

Tool calls are explicitly internal to each agent. The A2A protocol provides no mechanism for one agent to invoke another agent's tools or observe another agent's tool usage.

### 3.2. Community Implementation Patterns

Every major framework implements A2A the same way — tool calls stay internal, only text/data goes over the wire:

| Framework | Tool Call Handling | A2A Wire Content |
|-----------|-------------------|------------------|
| **Pydantic AI** | Stored in internal context storage | Text/data parts only |
| **Google ADK** | Internal to agent execution | Text parts only |
| **LangChain** | Internal to agent graph | Text parts at A2A endpoint |
| **CrewAI** | Internal agent tools | Text results via A2A |

### 3.3. Relevant GitHub Issues

| Issue | Topic | Outcome |
|-------|-------|---------|
| [#140](https://github.com/a2aproject/A2A/issues/140) | Should tasks carry tool definitions? | Closed — maintainer says tasks are "unstructured prompts" |
| [#563](https://github.com/a2aproject/A2A/issues/563) | AgentTool wrapping (agent-as-tool) | Discussion on wrapping A2A agents as MCP tools |
| [#769](https://github.com/a2aproject/A2A/issues/769) | A2A + LLM interaction patterns | Discussion on how A2A relates to direct LLM integration |

### 3.4. A2A Traceability Extension

The A2A spec includes a traceability extension mechanism that can *record* tool invocations for observability purposes, but this is strictly for logging/debugging — it does not request tool execution or expose tools to other agents.

### 3.5. No Formal Tool-Calling Extension

As of the RC v1.0 spec, no formal extension exists for tool calling over A2A. The community consensus is that this would violate the opaque execution principle. If an agent needs to use another agent's capabilities, it sends a message describing what it needs, and the receiving agent decides how to fulfill it using its own tools.

---

## 4. A2A in Shipyard's P2P Mesh (Future Architecture)

Three integration options were explored. The recommended approach is a hybrid.

### Option 1: Sidecar A2A (Recommended for Remote Agents)

Each daemon exposes an A2A HTTP endpoint alongside its existing CRDT sync infrastructure.

```
┌─────────────────────────────────────────────┐
│  Developer Machine A                         │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Daemon                               │   │
│  │  ├── Loro CRDT sync (WebRTC/WS)      │   │
│  │  ├── MCP server (stdio to agents)    │   │
│  │  └── A2A HTTP endpoint (:port/a2a)   │   │  A2A JSON-RPC
│  └──────────────────────────────────────┘   │◄────────────────►
│                                              │
└─────────────────────────────────────────────┘
```

**How it works:**
- The signaling server doubles as an **Agent Card directory** — daemons register their Agent Cards on connect
- Incoming A2A `message/send` creates a task in the local Loro doc
- Results flow back into CRDTs through the existing write path
- Outgoing A2A calls are made when the local agent needs to delegate to a remote agent

**Pros:** Standards-compliant, works with any A2A-compatible agent, clear trust boundary
**Cons:** Requires public HTTP endpoint or relay, adds latency vs direct CRDT sync

### Option 2: WebRTC Data Channel Binding (Future Enhancement)

A custom A2A binding that transmits A2A JSON-RPC messages over WebRTC data channels instead of HTTP.

```
Daemon A ◄──── WebRTC Data Channel ────► Daemon B
              (A2A JSON-RPC messages)
```

**How it works:**
- A2A spec Section 12 explicitly allows custom bindings with a WebSocket example as precedent
- Reuses Shipyard's existing WebRTC signaling infrastructure
- Avoids public HTTP endpoints, works behind NAT
- Agent Cards exchanged during signaling handshake

**Pros:** No public endpoints needed, low latency, reuses existing infrastructure
**Cons:** Non-standard binding (not interoperable with vanilla A2A agents), needs spec-compliant error mapping

### Option 3: Agent as CRDT Peer (Not Recommended for A2A)

Give remote agents direct write access to Loro CRDTs.

**Why not for A2A:**
- Violates A2A's opaque execution principle — CRDT writes expose internal state
- Trust boundary issues — remote agents could write arbitrary data
- Good for **local agents** (current approach via MCP tools), bad for inter-agent A2A

### Recommended Hybrid

| Agent Location | Communication | Protocol |
|----------------|---------------|----------|
| **Local** (own daemon) | CRDT direct writes via MCP tools | Current approach, no change |
| **Remote** (other Shipyard daemon) | A2A sidecar now, WebRTC binding later | A2A JSON-RPC |
| **External** (third-party agent) | A2A sidecar only | A2A JSON-RPC over HTTP |

This hybrid means local agents get full CRDT fidelity (tool calls, thinking blocks, etc.), while remote and external agents communicate through A2A's text-only protocol. The projection layer handles the translation.

---

## 5. Schema Implications for Future A2A Support

These are "don't paint yourself into a corner" items — fields and structures to consider adding when the time comes, so the current schema remains forward-compatible.

### 5.1. Message Provenance

Add a `source` field to messages to distinguish local agent output from A2A-received content:

```typescript
// Future addition to MessageShape
source: Shape.plain.string('local', 'a2a-remote', 'a2a-external').nullable(),
```

### 5.2. Task Delegation

Add `contextId` and `parentTaskId` to task meta for multi-agent delegation chains:

```typescript
// Future addition to TaskDocumentSchema.meta
contextId: Shape.plain.string().nullable(),      // A2A context grouping
parentTaskId: Shape.plain.string().nullable(),   // delegation chain
```

### 5.3. Artifacts

A2A separates messages from artifacts (deliverables). Add an `artifacts` list to `TaskDocumentSchema`:

```typescript
// Future addition to TaskDocumentSchema
artifacts: Shape.list(Shape.plain.struct({
  id: Shape.plain.string(),
  name: Shape.plain.string(),
  mimeType: Shape.plain.string(),
  parts: Shape.plain.array(/* A2A Part shape */),
})),
```

### 5.4. Agent Cards

Store Agent Cards in Loro ephemeral state (they're transient — agents come and go):

```typescript
// Future: ephemeral state on RoomSchema
agentCards: Map<machineId, AgentCard>  // via Loro awareness/ephemeral
```

### 5.5. Task State Alignment

Current Shipyard task states vs A2A `TaskState` enum:

| A2A State | Proto Value | Shipyard Equivalent | Status |
|-----------|-------------|---------------------|--------|
| `TASK_STATE_SUBMITTED` | 1 | `submitted` | Present |
| `TASK_STATE_WORKING` | 2 | `working` | Present |
| `TASK_STATE_COMPLETED` | 3 | `completed` | Present |
| `TASK_STATE_FAILED` | 4 | `failed` | Present |
| `TASK_STATE_CANCELED` | 5 | `canceled` | Present |
| `TASK_STATE_INPUT_REQUIRED` | 6 | `input-required` | Present |
| `TASK_STATE_REJECTED` | 7 | — | **Missing** |
| `TASK_STATE_AUTH_REQUIRED` | 8 | — | **Missing** |

Six of eight A2A states are already present in `A2A_TASK_STATES` (see `packages/loro-schema/src/shapes.ts` line 58). The two missing states (`rejected`, `auth-required`) are relevant only for A2A inter-agent scenarios where an agent may refuse a task or require authentication.

---

## 6. Local Reference Repos

All protocol implementations are available locally for reference during implementation. Per project conventions, always search local repos instead of web searching.

| Repo | Path | Package | Version |
|------|------|---------|---------|
| A2A spec | `/Users/jacobpetterle/Working Directory/A2A/` | — | RC v1.0 |
| A2A JS SDK | `/Users/jacobpetterle/Working Directory/a2a-js/` | `@a2a-js/sdk` | v0.3.10 |
| Claude Agent SDK | `/Users/jacobpetterle/Working Directory/claude-agent-sdk-typescript/` | `@anthropic-ai/claude-agent-sdk` | — |
| loro-extended | `/Users/jacobpetterle/Working Directory/loro-extended/` | `@loro-extended/*` | — |
| MCP schema | `/private/tmp/claude-501/mcp-schema.md` | `@modelcontextprotocol/sdk` | — |

**Key spec locations:**
- A2A protocol spec: `A2A/docs/specification.md`
- A2A protobuf definition: `A2A/specification/a2a.proto`
- A2A task states: `a2a.proto` lines 176-200
- A2A custom binding guidelines: `specification.md` Section 12

---

## 7. Open Questions

| # | Question | Notes |
|---|----------|-------|
| 1 | Should we add `auth-required` and `rejected` task states now or wait for A2A integration? | Adding now costs nothing (just two strings in the `A2A_TASK_STATES` array) but there are no consumers yet. Recommendation: add when we have a use case. |
| 2 | Should Agent Cards include MCP tool listings (bridging A2A skills with MCP tools)? | This would let an A2A client see what MCP tools a Shipyard agent exposes, but violates A2A's opaque execution principle. Agent Cards should list *skills* (high-level capabilities), not tools. |
| 3 | Should Shipyard propose WebRTC data channel binding as a community A2A extension? | Section 12 of the spec provides guidelines for custom bindings. A WebRTC binding would benefit P2P-first systems. Worth pursuing after we validate the pattern internally. |
| 4 | How should the A2A projection layer handle streaming? | A2A supports `message/stream` with SSE. The projection layer needs to convert Loro CRDT subscriptions into SSE streams, filtering to text-only content. |
| 5 | Should A2A context IDs map to Shipyard room IDs or task IDs? | A2A's `contextId` groups related tasks. In Shipyard, a "room" is the natural grouping, but a single task is the unit of delegation. Needs design when implementing. |

---

## Appendix: A2A Projection Layer (Conceptual)

When A2A integration is implemented, the projection works as follows:

```
Internal (CRDT)                          External (A2A wire)
─────────────────                        ──────────────────
Message {                                Message {
  role: 'assistant',          ──►          role: 'agent',
  content: [                               parts: [
    { type: 'thinking', ... }   DROPPED      { kind: 'text',
    { type: 'tool_use', ... }   DROPPED        text: '...' }
    { type: 'tool_result', ..}  DROPPED    ]
    { type: 'text', text }      KEPT     }
  ]
}
```

**Rules:**
1. Only `text` content blocks become A2A `TextPart`s
2. `tool_use`, `tool_result`, `thinking`, `redacted_thinking` are stripped
3. `server_tool_use`, `web_search_tool_result` are stripped
4. File artifacts become A2A `FilePart`s with inline bytes or URI references
5. Structured data (JSON) becomes A2A `DataPart`s

This is a lossy transformation by design — A2A consumers see the *results* of tool execution, not the tool calls themselves.

---

*Last updated: 2026-02-14*
