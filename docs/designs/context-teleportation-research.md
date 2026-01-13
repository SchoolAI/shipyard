# Context Teleportation Research Summary

**Issue:** #41 - Teleport conversation history between agents
**Date:** 2026-01-12
**Status:** Research Complete

---

## Executive Summary

This research explores how to enable AI agents to export and import conversation context for seamless handoffs between different agent types (Claude ↔ Devin ↔ Cursor, etc.). The key finding is that **no universal conversation interchange format exists**, but several emerging protocols and patterns provide a foundation for peer-plan to build upon.

---

## 1. Industry Standards Landscape

### The Three Emerging Protocols

| Protocol | Purpose | Governance | Status |
|----------|---------|------------|--------|
| **MCP** (Model Context Protocol) | Tool/data access for agents | Anthropic → Linux Foundation | Mature |
| **A2A** (Agent2Agent) | Agent-to-agent communication | Google → Linux Foundation | v0.3 (Dec 2025) |
| **AGENTS.md** | Static context for coding agents | Linux Foundation | Widely adopted (60k+ repos) |

### Protocol Comparison

#### MCP (Anthropic)
- **Focus:** Connecting LLMs to external tools/data
- **Context handling:** Stateless by design, optional resource context
- **Session support:** Minimal - primarily stateless operation
- **Conversation format:** JSON-RPC 2.0 for tool calls
- **Key insight:** MCP focuses on tool access, NOT conversation history

#### A2A (Google)
- **Focus:** Agent-to-agent collaboration
- **Context handling:** `contextId` groups related exchanges
- **Session support:** Task lifecycle with history retrieval via `historyLength`
- **Message format:** JSON-RPC 2.0 with Task objects and Artifacts
- **Key insight:** A2A has explicit support for context sharing between agents

**A2A Message Structure:**
```typescript
interface Message {
  messageId: string;
  role: "user" | "agent";
  parts: (TextPart | FilePart | DataPart)[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
}

interface Task {
  taskId: string;
  contextId?: string;  // Groups related tasks
  history?: Message[];
  status: "submitted" | "working" | "completed" | "failed";
  // ...
}
```

#### AGENTS.md
- **Focus:** Static project context for any agent
- **Format:** Standard Markdown with flexible structure
- **Adoption:** Google, OpenAI, Cursor, Devin, Factory, Sourcegraph
- **Key insight:** Complements conversation history with project knowledge

### Academic Survey Findings

From [arXiv survey on agent interoperability](https://arxiv.org/html/2505.02279v1):

| Protocol | Context/State Approach |
|----------|------------------------|
| MCP | Stateless with optional persistent tool context |
| ACP | Session-aware with explicit run state tracking (merged into A2A) |
| A2A | Flexible - supports both stateless and stateful via `contextId` |
| ANP | Decentralized with DID-based identity persistence |

**Recommendation from survey:** Phased adoption - MCP → ACP → A2A → ANP based on complexity needs.

---

## 2. Platform-Specific Analysis

### Devin (Cognition Labs)

**Session Management:**
- Sessions can be "woken up" after inactivity
- Workspace resets to saved machine state at session start
- Knowledge Base stores "bite-sized, persistent context" across sessions

**API Capabilities:**
- `POST /v1/sessions` - Create new session
- `GET /v1/sessions/{session_id}` - Retrieve session details including `messages`
- Sessions include: `structured_output`, `status`, `pull_request` URL

**Context Limitations:**
- Sessions do NOT share context - parallelization across sessions doesn't work directly
- No dedicated "context export" API for cross-platform handoff
- "Session Insights" analyzes sessions and generates improved prompts

**Key finding:** Devin focuses on internal session continuity, not cross-platform portability.

### Claude Code

**Storage Format:**
- Local JSONL files at `~/.claude/projects/`
- Each line is a discrete message event with:
  - Session UUID, timestamps, project directory
  - Message counts (user/assistant/tool)
  - Model identifiers and token usage
  - Tool execution details (codes, durations)
  - Parent-child message relationships via UUID

**Export Options:**
- Built-in: `/export [filename]` command
- Third-party tools exist:
  - `claude-conversation-extractor` (Python) - reads local files
  - `claude-session-exporter` (TypeScript) - programmatic API
  - `claude-code-exporter` (MCP server) - integrates with Claude Desktop

**Context Persistence Patterns:**
- **Continuous Claude** project implements "handoff files" in YAML format
- Uses hooks: `SessionStart`, `SessionEnd`, `PreCompact` for auto-capture
- Stores in `thoughts/shared/handoffs/` for between-session transfer

### Cursor

**Storage Format:**
- SQLite database: `state.vscdb`
- Key-value table `cursorDiskKV` with:
  - `composerData:<composerId>` - conversation metadata
  - Bubbles (messages) with `bubbleId`, `type`, `text`, `richText`
- No encryption/obfuscation

**Export Options:**
- Built-in markdown export via UI
- SpecStory extension auto-saves to `.specstory/history/`
- Third-party tools: `cursor-chat-export`, `cursor-history`

**Key limitation:** **No import capability** - can export but cannot restore conversations

### v0/Lovable/Bolt.new

**Pattern:** Web-based code generators focus on:
- Code/project export (ZIP, GitHub push)
- Shareable links for collaboration
- Git integration for bidirectional sync

**No conversation export** - these tools export artifacts, not conversation history.

---

## 3. Conversation Format Comparison

### Common Elements Across Platforms

| Element | Claude Code | Cursor | Devin | A2A Protocol |
|---------|-------------|--------|-------|--------------|
| Messages | JSONL array | SQLite blobs | API response | `Message[]` |
| Role | user/assistant | type 1/2 | - | user/agent |
| Content | text blocks | `text`, `richText` | `messages` | `parts[]` |
| Tool calls | tool_use/tool_result | `toolFormerdata` | - | DataPart |
| Thinking | extended thinking | `thinking` field | - | - |
| Timestamps | ISO timestamps | milliseconds | ISO timestamps | - |
| Context | parent UUIDs | `relevantFiles` | `knowledge_ids` | `contextId` |

### What's NOT Standardized

1. **Tool call representation** - Each platform has proprietary format
2. **Thinking/reasoning blocks** - Not portable
3. **File/artifact references** - Platform-specific paths
4. **Session metadata** - Different schemas
5. **Approval/review status** - No standard

---

## 4. Essential Context for Handoffs

Based on research into pair programming, knowledge transfer, and session continuity:

### MUST HAVE (Enables immediate productivity)

| Category | What to Transfer | Why It Matters |
|----------|-----------------|----------------|
| **Current State** | What task is in progress, completion status | Prevents "where were we?" |
| **Next Steps** | Prioritized list of pending work | Enables immediate action |
| **Recent Decisions** | What was decided and why | Prevents re-litigation |
| **Blockers** | What's stuck and what was tried | Prevents repeating failures |
| **Key Files** | Which files are being modified | Reduces search time |

### SHOULD HAVE (Reduces friction)

| Category | What to Transfer | Why It Matters |
|----------|-----------------|----------------|
| **Rejected Approaches** | What was tried and failed | Prevents wasted effort |
| **Open Questions** | Unresolved technical questions | Enables decisions |
| **Testing Status** | What tests pass/fail | Enables validation |
| **Artifacts** | Screenshots, test results, etc. | Provides proof |

### TYPICALLY LOST

1. **Failed attempts and dead ends**
2. **Implicit context** - assumptions that "everyone knows"
3. **Nuanced constraints** - edge cases
4. **Debugging context** - what was investigated
5. **Verbal/informal decisions**

---

## 5. OpenAI Agent Handoffs Pattern

OpenAI's agent SDK provides a reference implementation for handoffs:

```python
# Handoff transfers full conversation history by default
# History appears in <CONVERSATION HISTORY> block

RunConfig.nest_handoff_history  # Collapses prior transcript
Handoff.input_filter  # Customize what transfers
HandoffInputData  # Structure for filtered context
```

**Key insight:** Full history transfer with optional filtering is the default pattern.

---

## 6. Recommendations for Peer-Plan

### Option A: A2A-Compatible Export (Recommended)

Align `ConversationExport` with A2A protocol concepts:

```typescript
interface ConversationExport {
  // A2A-inspired fields
  contextId: string;        // Matches A2A contextId concept
  messages: A2AMessage[];   // A2A-compatible message format

  // Peer-plan specific
  planId: string;
  title: string;
  content: BlockNoteBlock[];
  threads: CommentThread[];
  activity: ActivityUpdate[];
  status: PlanStatus;
  metadata: PlanMetadata;

  // Export metadata
  exportedAt: number;
  exportedBy: string;
  sourceAgent: string;      // "claude-code" | "devin" | "cursor" | etc.
  version: number;
}

interface A2AMessage {
  messageId: string;
  role: "user" | "agent";
  parts: MessagePart[];
  metadata?: Record<string, unknown>;
}
```

### Option B: Markdown + YAML (Human-Readable)

Based on Claude Code handoff patterns:

```markdown
# Session Handoff - [Date]

## Context
- Plan: [title]
- Status: [status]
- Source: [agent name]

## Completed This Session
- ✅ Task 1
- ✅ Task 2

## In Progress
- [ ] Current task
  - Status: ...
  - Blocker: ...

## Decisions Made
- Chose A over B because [rationale]

## Rejected Approaches
- Tried X, failed because Y (don't retry)

## Comments/Feedback
[Exported threads from BlockNote]

## Next Steps
1. First priority
2. Second priority

## Key Files
- /path/to/file.ts - [what changed]
```

### Option C: Hybrid (JSON + Markdown Summary)

```typescript
interface ConversationExport {
  // Machine-readable
  json: {
    planId: string;
    content: BlockNoteBlock[];
    threads: CommentThread[];
    activity: ActivityUpdate[];
    metadata: PlanMetadata;
  };

  // Human-readable summary
  markdown: string;  // Auto-generated handoff summary

  // Encoding
  format: "base64+lzstring" | "json" | "markdown";
}
```

---

## 7. Implementation Considerations

### Cross-Platform Translation Challenges

1. **Tool calls** - Need to abstract or strip platform-specific tool formats
2. **File references** - Convert absolute paths to relative/project-based
3. **Artifacts** - Need portable URLs (GitHub raw URLs work cross-platform)
4. **Identity** - GitHub username provides portable identity

### What to Include vs. Exclude

**Include:**
- Plan content (BlockNote JSON)
- Comments/threads (structured)
- Review status
- Activity updates
- Artifact references (URLs)

**Exclude or Transform:**
- Raw conversation history (too platform-specific)
- Tool call details (not portable)
- Extended thinking blocks (proprietary)
- Local file paths (not portable)

### Size Constraints

Based on URL encoding research from peer-plan architecture:
- Target: ~10-50KB compressed
- Max safe: 100KB for clipboard/URLs
- Use `lz-string.compressToEncodedURIComponent()` for 40-60% reduction

---

## 8. Key Takeaways

1. **No universal standard exists** - Each platform has proprietary formats
2. **A2A is the closest fit** - Designed for agent-to-agent context sharing
3. **Export is common, import is rare** - Most platforms lack import capability
4. **Human-readable fallback matters** - When import fails, users need to read
5. **Focus on "what" and "why"** - Not raw conversation dumps
6. **Artifacts are portable** - GitHub URLs work everywhere
7. **AGENTS.md complements this** - Static context + dynamic handoff

### This is NOT Novel

The problem is real but the space is immature:
- A2A protocol is actively evolving
- Claude Code has a feature request for handoffs (#11455)
- Third-party tools filling gaps (SpecStory, cursor-chat-export)
- Industry converging but not standardized yet

### Peer-Plan Opportunity

Peer-plan can be the **portable handoff layer** that:
1. Captures context during collaborative review
2. Exports in multiple formats (A2A-compatible + markdown)
3. Imports from other agents via URL or file
4. Bridges the gap until standards mature

---

## Sources

### Protocols & Standards
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [A2A GitHub Repository](https://github.com/a2aproject/A2A)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [AGENTS.md Standard](https://agents.md/)
- [arXiv: Survey of Agent Interoperability Protocols](https://arxiv.org/html/2505.02279v1)

### Platform Documentation
- [Devin API Reference](https://docs.devin.ai/api-reference/overview)
- [Devin External API](https://docs.devin.ai/external-api/external-api)
- [Cursor Export Docs](https://cursor.com/docs/agent/chat/export)

### Tools & Projects
- [claude-session-exporter](https://github.com/yigitkonur/claude-session-exporter)
- [cursor-chat-export](https://github.com/somogyijanos/cursor-chat-export)
- [SpecStory Extension](https://docs.specstory.com/integrations/cursor)
- [Continuous Claude](https://github.com/parcadei/Continuous-Claude-v3)

### Research & Best Practices
- [Claude Code Session Handoff Feature Request](https://github.com/anthropics/claude-code/issues/11455)
- [On Pair Programming - Martin Fowler](https://martinfowler.com/articles/on-pair-programming.html)
- [OpenAI Agent SDK Handoffs](https://openai.github.io/openai-agents-python/handoffs/)

---

## Appendix A: Additional Agent Research Findings

### MCP Protocol Deep Dive

From detailed MCP specification analysis:

**Session Management:**
- MCP uses session IDs via transport layer (HTTP headers)
- `sessionIdGenerator` enables stateful mode
- `EventStore` supports resumability via `Last-Event-Id` header
- **No built-in session transfer** between servers

**Best Approach for Context Injection:**
- Use **Prompts capability** - returns `PromptMessage[]` representing conversation turns
- Prompts can be parameterized for context retrieval
- `sampling/createMessage` includes `messages` array (closest to conversation export)

**JSON Schema Alignment for ConversationExport:**
```typescript
// MCP-aligned message format
interface ConversationMessage {
  role: "user" | "assistant";
  content: ContentBlock | ContentBlock[];
  _meta?: Record<string, unknown>;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "tool_use"; name: string; id: string; input: object }
  | { type: "tool_result"; toolUseId: string; content: ContentBlock[] };
```

### Claude Code Session Architecture

**Storage Format:**
```
~/.claude/
├── projects/
│   └── [encoded-directory-paths]/
│       └── [session-uuid].jsonl  # Full transcript
```

**JSONL Message Structure:**
```json
{
  "parentUuid": "previous-message-uuid",
  "sessionId": "session-uuid",
  "type": "user|assistant|summary",
  "message": {
    "role": "user|assistant",
    "content": [{ "type": "text", "text": "..." }]
  },
  "uuid": "message-id",
  "timestamp": "ISO-timestamp"
}
```

**Resume Commands:**
- `claude --continue` - resume most recent
- `claude --resume <session-id>` - resume specific session
- SDK: `options.resume = sessionId` with optional `forkSession: true`

**Hooks for Context Injection:**
| Hook | Use for Teleportation |
|------|----------------------|
| `SessionStart` | Inject imported context via `additionalContext` |
| `UserPromptSubmit` | stdout becomes context for Claude |
| `PostToolUse` | Add context after tool execution |

### Cursor Internal Schema

**SQLite Storage (`state.vscdb`):**
```sql
Table: cursorDiskKV
Keys:
- composerData:<composerId>  -- Conversation metadata
- aiService.prompts          -- User prompts
- workbench.panel.aichat...  -- Chat data
```

**Bubble (Message) Structure:**
```json
{
  "_v": 2,
  "bubbleId": "id",
  "type": 1,  // 1=user, 2=AI
  "text": "content",
  "thinking": "...",       // AI only
  "toolFormerData": {...}, // Tool execution
  "relevantFiles": [...],  // User only
  "context": {...}         // User only
}
```

**Critical:** No import capability - export only (Markdown)

### Conversation Interchange Standards

**Open Message Format (OMF):**
- Lightweight universal format
- Direct compatibility: OpenAI, Anthropic, Mistral
- Requires converters: Google, Bedrock, Cohere

**LLM Bridge (TypeScript):**
- Lossless round-trip conversion
- Stores provider-specific data in `_original` field
- Auto-detects provider from request format

**Translation Approach Recommendation:**
1. **Core:** OpenAI-compatible base (widest adoption)
2. **Extensions:** Namespaced for provider-specific features
3. **Metadata:** Preserve original for round-trips

```json
{
  "version": "1.0",
  "source_provider": "anthropic",
  "messages": [...],
  "extensions": {
    "anthropic": { "thinking": {...} }
  },
  "_original": {...}
}
```

### Google Antigravity & Artifacts as Proof

**Artifact Types in Antigravity:**
- Task lists / Implementation plans
- Walkthroughs (summaries of changes)
- Screenshots (before/after)
- Browser recordings (video)
- Code diffs

**MAIF (Multimodal Artifact File Format):**
- Research proposal for standardized artifacts
- Cryptographic provenance chains
- Performance: 2,720 MB/s streaming

**Industry Trend:** "Trust-to-Proof" shift - EU AI Act (2026) requires auditable, traceable AI systems.

### Pair Programming Handoff Research

**Essential Context for Handoffs:**

| Priority | Context Type |
|----------|--------------|
| MUST | Current task state, next steps, recent decisions |
| MUST | Blockers and what was tried |
| SHOULD | Rejected approaches, open questions |
| NICE | Historical context, team dynamics |

**What's Typically Lost:**
1. Failed attempts and dead ends
2. Implicit assumptions
3. Debugging context (stack traces, investigations)
4. Verbal/informal decisions

**Design Principle:** "Capture 'why' not 'what'" - code shows what; handoffs must capture rationale.

---

*Last updated: 2026-01-12*
