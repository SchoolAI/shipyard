# A2A Protocol Handoff Flow Research

> Research findings on agent-to-agent conversation handoffs, based on the Google A2A Protocol specification and related documentation.

**Date:** 2026-01-16
**Status:** Completed
**Researcher:** Claude (Opus 4.5)

---

## Executive Summary

The Google A2A (Agent-to-Agent) Protocol does **not** define an explicit "Accept" step for task handoffs. Tasks are implicitly accepted upon receipt and begin processing immediately. The protocol uses an **input-required** state for situations where clarification is needed, but this is mid-task rather than pre-acceptance.

**Key recommendation for Peer-Plan:** The current "Accept" button is semantically incorrect for A2A. Consider removing it in favor of auto-import to the detected platform, or repurpose it as "Import" for user agency.

---

## 1. A2A Protocol Findings

### 1.1 What is A2A?

The Agent2Agent (A2A) Protocol is an open protocol developed by Google (April 2025) for AI agent interoperability. It enables agents to:

- Discover each other's capabilities via Agent Cards (`.well-known/agent.json`)
- Negotiate interaction modalities (text, files, structured data)
- Manage collaborative tasks
- Securely exchange information

**Key principle:** Agents communicate without exposing internal state, memory, or tools.

### 1.2 Task Lifecycle

A2A defines tasks with the following states:

| State | Type | Description |
|-------|------|-------------|
| `submitted` | Non-terminal | Task received, not yet processed |
| `working` | Non-terminal | Task is being processed |
| `input-required` | Interrupted | Agent needs clarification from client |
| `auth-required` | Interrupted | Authentication needed to proceed |
| `completed` | Terminal | Task finished successfully |
| `cancelled` | Terminal | Task was stopped |
| `rejected` | Terminal | Task was declined |
| `failed` | Terminal | Task encountered an error |

### 1.3 The "Accept" Question

**Finding: There is NO explicit accept/acknowledge step in A2A.**

When Agent A sends a task to Agent B:

1. Agent B **immediately** begins processing (or queues it)
2. Agent B responds with a `Task` object containing status
3. If clarification is needed, Agent B returns `input-required` state
4. The protocol treats task creation as implicit acceptance

From the specification:
> "The agent MAY create a new Task to process the provided message asynchronously."

Tasks can be **rejected** (`rejected` state), but this happens during processing, not as a pre-acceptance gate.

### 1.4 Conversation History Handling

A2A maintains conversation continuity through:

1. **contextId**: Groups multiple related Task and Message objects
2. **taskId**: Tracks individual tasks within a context
3. **historyLength**: Parameter controlling message retrieval depth

The specification states:
> "Agents MUST accept and preserve client-provided contextId values when clients reuse them."

**History is NOT automatically included.** The sending agent constructs the message payload with whatever context is needed. The receiving agent does not have automatic access to prior conversation history.

### 1.5 Directionality

Handoffs in A2A are **one-way pushes**:

- Client agent sends task to remote agent
- Remote agent processes and returns results
- There is no bidirectional confirmation protocol

However, multi-turn interactions are supported:
- Agent B can return `input-required` state
- Agent A sends additional information via `tasks/send` with same `taskId`
- This creates a back-and-forth within a single logical task

### 1.6 Human-in-the-Loop Patterns

A2A supports human approval workflows through:

1. **LongRunningFunctionTool** pattern (recommended)
   - Agent pauses execution when approval needed
   - Signals back to root agent for human input
   - Root agent resumes with decision

2. **input-required state**
   - Agent requests clarification mid-task
   - Client provides additional information
   - Task continues

From Google's ADK documentation:
> "The standard, synchronous require_confirmation on a FunctionTool is not designed to work within AgentTool or across A2A boundaries."

---

## 2. What We Have Now in Peer-Plan

### 2.1 Current Flow

When a conversation is handed off via P2P:

1. Sender opens "Handoff Conversation" dialog
2. Selects a connected peer
3. Conversation is sent via WebRTC data channel
4. **Receiver sees modal with options:**
   - "Dismiss" - Close without action
   - "Download" - Save as `.a2a.json` file
   - "Import to Claude Code" - Create session file via registry

### 2.2 What "Accept" Does Today

Looking at `ImportConversationHandler.tsx`, the current flow:

1. Receiver reviews conversation preview
2. Clicks "Import to Claude Code" (or Download)
3. This calls `/api/conversation/import` on the registry server
4. Creates a Claude Code session file on disk
5. Adds a `ConversationVersion` to the CRDT

**Problem:** There's no actual "Accept" button - the modal has "Import to Claude Code" which is action-oriented, not acceptance-oriented. The metadata tracking (`addConversationVersion`) happens on import, not acceptance.

### 2.3 Gap Analysis

| A2A Pattern | Peer-Plan Current | Alignment |
|-------------|-------------------|-----------|
| Implicit task acceptance | Manual "Import" step | Misaligned - but reasonable for user agency |
| input-required for clarification | N/A | Not needed for conversation transfer |
| History via contextId | Messages included in transfer | Aligned |
| One-way push | One-way P2P transfer | Aligned |
| Terminal states | Implicit (import success/failure) | Partially aligned |

---

## 3. Recommendations

### 3.1 Should "Accept" Exist?

**Recommendation: Keep user confirmation, but rename from "Accept" to "Import".**

Rationale:
- A2A doesn't require explicit acceptance, but user agency is valuable
- Auto-importing without consent could be surprising/unwanted
- The current modal already uses "Import to Claude Code" which is correct
- Naming it "Accept" implies protocol compliance that doesn't exist

### 3.2 Proposed Flow

```
Conversation Received
        |
        v
   [Toast: "Received conversation from X (N messages)"]
        |
        +-- [Review] --> Show modal with preview
                              |
                              +-- [Dismiss] --> Discard
                              |
                              +-- [Download] --> Save file
                              |
                              +-- [Import to {Platform}] --> Create session
```

**Changes from current:**
1. Remove any "Accept" button (doesn't exist currently, confirm no plans to add)
2. Add platform detection for import button (TODO in codebase: Issue #9)
3. Consider auto-import option in user preferences (opt-in)

### 3.3 Conversation History Handling

**Current approach is correct:**
- All messages are included in the transfer payload
- Receiver gets full context
- This aligns with A2A's message-based context sharing

**No changes needed.**

### 3.4 Metadata to Track

Current metadata tracking (`ConversationVersion`) includes:
- `versionId`: Unique identifier
- `creator`: Who imported
- `platform`: Source platform
- `sessionId`: Source session
- `messageCount`: Number of messages
- `createdAt`: Import timestamp
- `handedOffAt`: When handed to another agent
- `handedOffTo`: Who received it

**Recommended additions:**
- `a2aExportId`: Link back to the export for tracing
- `taskId`: If we ever implement full A2A task semantics

### 3.5 Future Considerations

1. **Bi-directional sync**: A2A supports multi-turn via `input-required`. Could implement "Request changes" flow where receiver asks sender for clarification.

2. **Task semantics**: Could model the entire plan lifecycle as an A2A task with states (draft -> working -> review -> completed).

3. **Agent discovery**: Implement `.well-known/agent.json` for Peer-Plan instances to enable cross-instance discovery.

---

## 4. Summary Answers

### Q1: What is the intended flow when Agent A hands off to Agent B?

**A2A Flow:**
1. Agent A sends `tasks/send` request with messages
2. Agent B receives and begins processing immediately
3. Agent B returns Task object with status
4. If clarification needed, Agent B returns `input-required` state
5. Agent A sends additional info via same taskId
6. Task reaches terminal state (completed/failed/cancelled/rejected)

### Q2: Should there be an "Accept" step?

**No.** A2A does not define an acceptance step. Tasks are implicitly accepted on receipt. However, for Peer-Plan's UX, a user confirmation step (called "Import", not "Accept") provides valuable user agency.

### Q3: What happens to conversation history after handoff?

The sending agent includes all relevant messages in the transfer payload. The receiving agent does not have automatic access to history - only what's explicitly sent. Context is maintained via `contextId` for multi-turn interactions.

### Q4: Is handoff one-way or bi-directional?

**One-way push.** The initial handoff is a one-way transfer. However, A2A supports bi-directional communication via the `input-required` state, allowing the receiver to request clarification from the sender.

### Q5: What metadata should be tracked?

Current Peer-Plan tracking is good. Key fields:
- Export ID (for tracing)
- Source platform and session
- Message count
- Timestamps (export, import, handoff)
- Creator/recipient identities

---

## References

### Primary Sources

- [A2A Protocol Specification (DRAFT v1.0)](https://a2a-protocol.org/latest/specification/)
- [Life of a Task - A2A Protocol](https://a2a-protocol.org/latest/topics/life-of-a-task/)
- [Google A2A GitHub Repository](https://github.com/google/A2A)

### Implementation Examples

- [Google Codelabs: A2A Purchasing Concierge](https://codelabs.developers.google.com/intro-a2a-purchasing-concierge)
- [Getting Started with Google A2A (Medium)](https://medium.com/google-cloud/getting-started-with-google-a2a-a-hands-on-tutorial-for-the-agent2agent-protocol-3d3b5e055127)
- [Inside Google's A2A Protocol (Towards Data Science)](https://towardsdatascience.com/inside-googles-agent2agent-a2a-protocol-teaching-ai-agents-to-talk-to-each-other/)

### Related Protocol

- [A2A Protocol Explained (Hugging Face)](https://huggingface.co/blog/1bo/a2a-protocol-explained)
- [What Is A2A Protocol? (IBM)](https://www.ibm.com/think/topics/agent2agent-protocol)
- [A2A Protocol: Scope and Best Practices (ZBrain)](https://zbrain.ai/understanding-the-a2a-protocol/)
- [HITL Discussion for A2A Agents (GitHub)](https://github.com/google/adk-python/discussions/3276)

---

*Last updated: 2026-01-16*
