# Issue #72: Request User Input - Comprehensive Research

**Status**: Research Complete
**Issue**: [#72](https://github.com/SchoolAI/shipyard/issues/72)
**Research Date**: 2026-01-16

---

## Executive Summary

This document synthesizes research from 5 parallel research agents covering:
1. MCP Protocol specifications for elicitation
2. Claude Code's AskUserQuestion tool implementation
3. Industry patterns from Cursor, Devin, Cline, Copilot, Aider
4. Existing MCP server implementations
5. Shipyard's current architecture and integration points

**Key Finding**: The industry has converged on **three distinct patterns** for user input requests, each with different trade-offs. We recommend implementing **all three** in phases.

---

## Table of Contents

1. [MCP Protocol Specification](#1-mcp-protocol-specification)
2. [Claude Code AskUserQuestion Tool](#2-claude-code-askuserquestion-tool)
3. [Existing MCP Server Implementations](#3-existing-mcp-server-implementations)
4. [Industry Patterns Analysis](#4-industry-patterns-analysis)
5. [Shipyard Architecture Integration Points](#5-shipyard-architecture-integration-points)
6. [Implementation Strategy](#6-implementation-strategy)
7. [Sources](#sources)

---

## 1. MCP Protocol Specification

### Overview

The Model Context Protocol added **elicitation** as an official feature in the 2025-06-18 specification update. This provides a standardized way for MCP servers to request user input mid-operation.

**Official Specification**: [MCP Elicitation Spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)

### Two Modes

#### Form Mode (In-Band Data Collection)

For non-sensitive structured data with JSON Schema validation.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "elicitation/create",
  "params": {
    "mode": "form",
    "message": "Please provide your GitHub username",
    "requestedSchema": {
      "type": "object",
      "properties": {
        "username": {
          "type": "string",
          "description": "Your GitHub username",
          "pattern": "^[a-zA-Z0-9-]+$"
        }
      },
      "required": ["username"]
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "action": "accept",
    "content": {
      "username": "jacobpetterle"
    }
  }
}
```

**Supported Schema Types**:
- String (with format, pattern, minLength, maxLength)
- Number/Integer (with minimum, maximum)
- Boolean
- Enum (single-select with `enum` or `oneOf`)
- Array of enum (multi-select with `items.enum` or `items.anyOf`)

**Restrictions**: Flat objects only - no nested objects or complex types.

#### URL Mode (Out-of-Band for Sensitive Data)

For credentials, OAuth flows, payments - data never passes through MCP client.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "elicitation/create",
  "params": {
    "mode": "url",
    "elicitationId": "550e8400-e29b-41d4-a716-446655440000",
    "url": "https://example.com/oauth/authorize?...",
    "message": "Please authorize this application."
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "action": "accept"
  }
}
```

**Important**: `action: "accept"` only means user consented to open the URL. The actual interaction happens out-of-band (in browser). Server sends `notifications/elicitation/complete` when done.

### Response Actions

Three-action model for user decisions:

| Action | User Intent | Example UI Interaction |
|--------|-------------|----------------------|
| `accept` | Explicitly approved | Clicked "Submit", "OK", "Confirm" |
| `decline` | Explicitly rejected | Clicked "Reject", "No", "Decline" |
| `cancel` | Dismissed without choice | Closed dialog, pressed ESC, timeout |

### Capability Negotiation

**Client declaration** during initialization:
```json
{
  "capabilities": {
    "elicitation": {
      "form": {},
      "url": {}
    }
  }
}
```

**Empty object is equivalent to form-only**: `"elicitation": {}` → `{ "form": {} }`

### Security Requirements

**Servers MUST:**
- Use URL mode for sensitive data (passwords, API keys, payment info)
- NOT include sensitive data in form mode schemas
- Verify user identity when using URL mode (prevent phishing)
- NOT assume client-provided user ID without verification

**Clients MUST:**
- Show full URL before opening (prevent phishing)
- Open URLs in sandboxed context (iOS: SFSafariViewController, not WKWebView)
- NOT allow client/LLM to inspect URL content or user inputs
- Provide UI indicating which server is requesting elicitation

### Claude Code Support Status

**Currently NOT supported** (as of January 2026).

- **Feature Request**: [Issue #2799](https://github.com/anthropics/claude-code/issues/2799)
- **Opened**: July 1, 2025
- **Reactions**: 110+ thumbs-up, 61+ comments
- **Status**: Assigned to Anthropic team, no official timeline

**VSCode Copilot** supports elicitation as of v1.102 (June 2025), making this a competitive gap.

### TypeScript SDK Example

**Server-side (requesting elicitation):**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const result = await server.elicitInput({
  message: "Please confirm this action",
  requestedSchema: {
    type: "object",
    properties: {
      confirm: { type: "boolean", title: "Confirm?" }
    },
    required: ["confirm"]
  }
});

if (result.action === "accept" && result.content.confirm) {
  // Proceed with action
}
```

**Client-side (handling elicitation):**
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

client.setRequestHandler(ElicitRequestSchema, async (request) => {
  const userResponse = await showFormToUser(
    request.params.message,
    request.params.requestedSchema
  );

  return {
    action: userResponse.action,
    content: userResponse.action === "accept" ? userResponse.data : undefined
  };
});
```

**Source**: [DEV Community - MCP Elicitation Guide](https://dev.to/kachurun/mcp-elicitation-human-in-the-loop-for-mcp-servers-m6a)

---

## 2. Claude Code AskUserQuestion Tool

### Overview

Claude Code's built-in `AskUserQuestion` tool was added in v2.0.21 (October 2025). It provides a structured multiple-choice interface for gathering user preferences during task execution.

**Official Documentation**: [Missing] - See [Issue #10346](https://github.com/anthropics/claude-code/issues/10346)
**System Prompt Docs**: [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-askuserquestion.md)

### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["questions"],
  "properties": {
    "questions": {
      "type": "array",
      "description": "Questions to ask the user (1-10 questions, 4 recommended for UX)",
      "minItems": 1,
      "maxItems": 10,
      "items": {
        "type": "object",
        "required": ["question", "header", "options", "multiSelect"],
        "properties": {
          "question": {
            "type": "string",
            "description": "Complete question ending with '?'"
          },
          "header": {
            "type": "string",
            "description": "Very short label as chip/tag (max 12 chars)"
          },
          "multiSelect": {
            "type": "boolean",
            "default": false,
            "description": "Allow multiple option selections"
          },
          "options": {
            "type": "array",
            "minItems": 2,
            "maxItems": 4,
            "items": {
              "type": "object",
              "required": ["label", "description"],
              "properties": {
                "label": {
                  "type": "string",
                  "description": "Display text (1-5 words)"
                },
                "description": {
                  "type": "string",
                  "description": "Explanation of option"
                }
              }
            }
          }
        }
      }
    },
    "answers": {
      "type": "object",
      "description": "User answers collected (populated by Claude Code)"
    }
  }
}
```

### Key Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Max questions per call | 4 | Avoid overwhelming user |
| Options per question | 2-4 | Keep choices manageable |
| Header length | 12 chars | Fits in chip UI |
| Timeout | 60 seconds | Prevent infinite blocking |
| "Other" option | Auto-added | Always allow freeform text |
| Sub-agent usage | Prohibited | Tool unavailable in sub-agents |

### Usage Patterns

**When to use:**
- Gather user preferences or requirements
- Clarify ambiguous instructions
- Get decisions on implementation choices
- Offer choices about direction

**When NOT to use:**
- In plan mode (use `ExitPlanMode` instead)
- From sub-agents (tool unavailable)
- For questions with >4 options (break into multiple calls)

### Example Usage

```typescript
await askUserQuestion({
  questions: [
    {
      question: "Which database should we use?",
      header: "Database",
      multiSelect: false,
      options: [
        {
          label: "PostgreSQL",
          description: "Full-featured relational database with excellent JSON support"
        },
        {
          label: "SQLite",
          description: "Lightweight file-based database, no server needed"
        },
        {
          label: "MongoDB",
          description: "Document-oriented NoSQL database"
        }
      ]
    }
  ]
});

// Response populated in `answers` field:
// { "Database": "PostgreSQL" }
```

### Hook Integration

Hooks can intercept `AskUserQuestion` via `canUseTool` callback in Claude Agent SDK:

```typescript
canUseTool: async (toolName, input) => {
  if (toolName === "AskUserQuestion") {
    // Custom handling - display in your UI
    const response = await showCustomQuestionDialog(input.questions);
    return {
      behavior: "allow",
      updatedInput: { ...input, answers: response }
    };
  }
  return { behavior: "allow" };
}
```

**Important**: Callback must return within 60 seconds or Claude assumes denial.

---

## 3. Existing MCP Server Implementations

### 3.1 Human-In-the-Loop MCP Server (by GongRzhe)

**GitHub**: [GongRzhe/Human-In-the-Loop-MCP-Server](https://github.com/GongRzhe/Human-In-the-Loop-MCP-Server)

**Language**: Python with tkinter
**Platform**: Windows 11, macOS, Linux
**Transport**: stdio

**Tools Exposed** (6 total):

| Tool | Purpose | Parameters |
|------|---------|------------|
| `get_user_input` | Single-line text input | message, inputType (text/integer/float), defaultValue |
| `get_user_choice` | Single/multiple choice | message, choices, allowMultiple, minChoices, maxChoices |
| `get_multiline_input` | Extended text input | message, defaultValue, minChars, maxChars |
| `show_confirmation_dialog` | Yes/No decisions | message, defaultValue |
| `show_info_message` | Notifications | message, messageType (info/warning/success/error) |
| `health_check` | Server status verification | (none) |

**Architecture**:
- GUI dialogs in separate threads (non-blocking)
- 5-minute configurable timeout per dialog
- Platform-specific styling (Windows 11 modern UI, macOS SF Pro, Linux Ubuntu)
- Returns structured JSON with success status, user input, cancellation flags

**Response Format:**
```json
{
  "success": true,
  "user_input": "User's response",
  "cancelled": false,
  "platform": "Darwin",
  "selected_choices": ["Option 1", "Option 2"],  // For choice tool
  "char_count": 150,                            // For multiline tool
  "confirmed": true                              // For confirmation tool
}
```

**Integration Example:**
```json
// In .mcp.json or claude_desktop_config.json
{
  "mcpServers": {
    "hitl": {
      "command": "uvx",
      "args": ["hitl-mcp-server"]
    }
  }
}
```

### 3.2 user-prompt-mcp (by nazar256)

**GitHub**: [nazar256/user-prompt-mcp](https://github.com/nazar256/user-prompt-mcp)

**Language**: Go
**Platform**: Linux (zenity), macOS (osascript)
**Transport**: stdio

**Tool Exposed**: `input_user_prompt`

**Implementation**:
- Spawns native OS dialogs (zenity/osascript)
- 20-minute default timeout (configurable via `--timeout` or `USER_PROMPT_TIMEOUT`)
- Text wrapping support in dialogs
- Primarily for Cursor IDE

**Usage:**
```bash
# Installation
go install github.com/nazar256/user-prompt-mcp@latest

# Configuration in Cursor
{
  "mcpServers": {
    "user-prompt": {
      "command": "user-prompt-mcp",
      "args": ["--timeout", "600"]  // 10 minute timeout
    }
  }
}
```

### 3.3 prompt-for-user-input-mcp (by goldensansapple)

**GitHub**: [goldensansapple/prompt-for-user-input-mcp](https://github.com/goldensansapple/prompt-for-user-input-mcp)

**Language**: Python with FastAPI
**Platform**: Cross-platform (HTTP-based)
**Transport**: HTTP server on port 4444

**Tool Exposed**: `prompt_for_user_input`

**Features**:
- Token-based authentication via `PROMPT_FOR_USER_INPUT_MCP_AUTH_TOKEN`
- Async user interaction via HTTP endpoints
- Designed for Cursor IDE integration

**Architecture**:
```
Claude → MCP Client → HTTP (port 4444) → FastAPI Server → Renders UI → User responds → Returns to Claude
```

### 3.4 ask-user-questions-mcp (by paulp-o)

**GitHub**: [paulp-o/ask-user-questions-mcp](https://github.com/paulp-o/ask-user-questions-mcp)

**Features**:
- CLI tool with clean terminal UX
- Non-blocking asynchronous question handling (FIFO queue)
- Supports multi-agent workflows
- File-based session storage
- ~150 tokens context overhead per question

**MCP Hub Integration**: [LobeHub - AUQ](https://lobehub.com/mcp/paulp-o-ask-user-questions-mcp)

### 3.5 systemprompt-mcp-server (Reference Implementation)

**GitHub**: [systempromptio/systemprompt-mcp-server](https://github.com/systempromptio/systemprompt-mcp-server)

**Language**: TypeScript
**Features**: Full MCP implementation including elicitation examples

**Elicitation Types Demonstrated**:
- `input` - Text input
- `confirm` - Yes/No confirmation
- `choice` - Single/multiple selection

**Use Case**: Reference implementation demonstrating all MCP 2025-11-25 features.

### 3.6 interactive-mcp (by @ttommyth)

**Source**: [Glama - Interactive MCP](https://glama.ai/mcp/servers/@ttommyth/interactive-mcp/tools/request_user_input)

**Tool**: `request_user_input`

**Parameters**:
```typescript
{
  projectName: string;          // Context identifier
  message: string;              // The question
  predefinedOptions?: string[]; // Optional choices
}
```

**Implementation**:
- Spawns platform-specific Node.js UI script
- Uses temporary files for IPC
- Heartbeat monitoring for process failures
- 30-60 second configurable timeout

---

## 4. Industry Patterns Analysis

### 4.1 Devin AI - Confidence-Based Escalation

**Sources**: [Devin Agents 101](https://devin.ai/agents101), [Devin Docs](https://docs.devin.ai/get-started/first-run)

**Philosophy**: Ask mode + Agent mode with **self-assessed confidence evaluation**.

**Pattern:**
```
1. Agent assesses confidence for task
2. If confidence < threshold → Ask mode (plan with clarifications)
3. If confidence >= threshold → Agent mode (autonomous execution)
4. During execution, if blocked → request clarification
5. User answers → agent continues
```

**Multi-Agent Architecture**:
- `task_assigner_agent` delegates to specialized agents
- `code_editor_agent` handles file manipulation
- `command_line_agent` executes commands
- `error_handling_agent` suggests fixes

**Key Insight**: "Later versions got self-assessed confidence evaluation, asking for clarification when it is not confident enough to perform the task as assigned."

### 4.2 Cursor - Autonomy-First Approach

**Sources**: [Cursor System Prompts (unofficial)](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools), [Cursor Prompting Rules Gist](https://gist.github.com/aashari/07cc9c1b6c0debbeb4f4d94a3a81339e)

**Philosophy**: Minimize interruptions, bias to autonomous resolution.

**Key Directives**:
> "If you need additional information that you can get via tool calls, prefer that over asking the user."

> "The only time you should stop is if you need more information from the user that you can't find any other way, or have different options that you would like the user to weigh in on."

**Tool-Specific Thresholds**:
- **High threshold** (rarely ask): Search, exploration, read operations
- **Low threshold** (frequently ask): Destructive operations, checkout, payments

**Shadow Workspace**:
- Cursor creates preview of changes in isolated workspace
- User reviews before applying to real files
- Reduces need for pre-approval questions

### 4.3 GitHub Copilot - Plan Agent with Clarifications

**Sources**: [Copilot Docs - Asking Questions](https://docs.github.com/en/copilot/using-github-copilot/asking-github-copilot-questions-in-your-ide)

**Plan Agent Flow**:
```
1. Agent generates high-level plan
2. Plan includes "open questions for clarification"
3. User reviews plan and answers questions
4. Multiple iterations to clarify requirements
5. Final approval → execute plan
```

**Follow-Up Pattern**:
- Conversation threads preserve context
- User can ask "tell me more" for elaboration
- Detailed foundational prompts improve follow-up relevance

**Code Review Limitation**:
- No follow-up questions in automated review comments
- Workaround: Copy comment to Copilot Chat for discussion

### 4.4 Cline - XML-Based ask_followup_question

**Sources**: [Cline Tools Guide](https://docs.cline.bot/exploring-clines-tools/cline-tools-guide)

**Tool Name**: `ask_followup_question`

**XML Schema**:
```xml
<ask_followup_question>
  <question>Which styling approach would you prefer?</question>
  <follow_up>
    <suggest>Use Bootstrap for rapid development</suggest>
    <suggest>Use Tailwind CSS for utility-first styling</suggest>
    <suggest>Use vanilla CSS for complete control</suggest>
  </follow_up>
</ask_followup_question>
```

**Parameters**:
- `<question>` (required): The specific question
- `<follow_up>` (optional): 2-4 `<suggest>` tags with pre-written answers

**Response**:
```xml
<answer>Use Tailwind CSS for utility-first styling</answer>
```

**When to Use**:
- Task requirements lack sufficient detail
- Multiple valid approaches exist
- Technical preferences needed
- Prevent incorrect assumptions

**Known Issue**: Concurrent question requests can cause "Current ask promise was ignored" errors.

### 4.5 OpenAI Codex - Bias to Action

**Sources**: [OpenAI Codex](https://openai.com/codex/), [GPT-5 Codex Prompting Guide](https://cookbook.openai.com/examples/gpt-5/gpt-5-1-codex-max_prompting_guide)

**Philosophy**: Autonomous completion with reasonable assumptions.

**System Prompt Directives**:
> "Bias to action: default to implementing with reasonable assumptions; do not end your turn with clarifications unless truly blocked."

> "Persist until the task is fully handled end-to-end within the current turn whenever feasible."

**Interaction Model**:
- Makes assumptions and proceeds
- Only asks when truly blocked
- Can be @mentioned on PRs for follow-up
- Future: interactive guidance mid-task (planned feature)

### 4.6 Aider - Terminal Interactive Session

**Sources**: [Aider Docs](https://aider.chat/docs/), [Aider GitHub](https://github.com/Aider-AI/aider)

**Chat Modes**:
- **Code mode** (default): Direct file editing
- **Architect mode**: Planning and design discussions
- **Ask mode**: Questions without file changes

**Command System**:
- Slash commands: `/add`, `/drop`, `/commit`, `/voice`
- Auto-discovered from `Commands` class methods (`cmd_` prefix)
- Interactive chat loop in `Coder.run()`
- `InputOutput` system with auto-completion

**Pattern**: Continuous interactive terminal session, not pause-and-resume like MCP elicitation.

---

## 5. Shipyard Architecture Integration Points

### 5.1 Current Hook System

**Hook Entry Point**: `apps/hook/src/index.ts`
- Reads JSON from stdin, writes to stdout
- Intercepts Claude Code lifecycle events

**Hook Events Handled**:
| Event | Trigger | Handler |
|-------|---------|---------|
| `plan_start` | Entering plan mode | `createPlan()` → Opens browser |
| `content_update` | Writing plan file | `updateContent()` → Syncs to registry |
| `plan_exit` | ExitPlanMode tool call | `checkReviewStatus()` → Blocks until approval |
| `post_exit` | After ExitPlanMode completes | Injects sessionToken + deliverables context |

**Blocking Mechanism**: `apps/hook/src/core/review-status.ts:waitForReviewDecision()`
```typescript
// Creates WebSocket connection to registry
const wsProvider = new WebsocketProvider(wsUrl, planId, ydoc);

// Observes Y.Doc metadata for status changes
const unsubscribe = ydoc.on('update', () => {
  const metadata = ydoc.getMap('metadata');
  const status = metadata.get('status');

  if (status === 'in_progress' || status === 'completed') {
    // Unblock and return approval
    resolve({ approved: true, ...});
  }
});

// Timeout after 25 minutes
```

**Key Insight**: This blocking pattern could be reused for input requests!

### 5.2 Y.Doc Structure (CRDT)

**Defined in**: `packages/schema/src/yjs-keys.ts`

**Existing Keys**:
```typescript
YDOC_KEYS = {
  METADATA: 'metadata',              // Plan metadata (status, title, etc.)
  DOCUMENT_FRAGMENT: 'document',     // BlockNote editor content
  THREADS: 'threads',                // Comments (managed by BlockNote)
  STEP_COMPLETIONS: 'stepCompletions',
  DELIVERABLES: 'deliverables',
  ARTIFACTS: 'artifacts',
  PRESENCE: 'presence',              // Real-time "agent is here" indicator
  LINKED_PRS: 'linkedPRs',
  PR_REVIEW_COMMENTS: 'prReviewComments',
  EVENTS: 'events',                  // Plan event log
  SNAPSHOTS: 'snapshots',            // Version history
  PLANS: 'plans'                     // (index doc only)
}
```

**Proposed Addition**:
```typescript
INPUT_REQUESTS: 'inputRequests'  // Y.Array<InputRequest>
```

**Schema**:
```typescript
interface InputRequest {
  id: string;                    // Unique request ID
  createdAt: number;            // Unix timestamp
  message: string;              // Question to display
  type: 'text' | 'choice' | 'confirm' | 'multiline';
  options?: string[];           // For choice type
  schema?: JSONSchema;          // For validation
  status: 'pending' | 'answered' | 'cancelled';
  response?: unknown;           // User's answer
  answeredAt?: number;
  answeredBy?: string;          // User ID/name
}
```

### 5.3 WebSocket Communication

**Registry Server**: `apps/server/src/registry-server.ts`
- Uses `y-websocket` protocol (port 3000)
- Bidirectional CRDT sync
- Awareness protocol for presence

**Browser Client**: `apps/web/src/hooks/useYjsSync.ts`
- WebSocket provider to registry
- IndexedDB persistence
- WebRTC P2P to other browsers

**Message Flow for Input Requests**:
```
1. Agent → MCP tool → Server adds request to Y.Doc inputRequests array
2. Y.Doc sync → WebSocket → Browser receives update
3. Browser renders modal with question
4. User responds → Browser updates Y.Doc request with response
5. Y.Doc sync → WebSocket → Server receives update
6. MCP tool handler unblocks → Returns response to agent
```

### 5.4 tRPC HTTP API

**Hook Communication**: `apps/hook/src/trpc-client.ts`
- HTTP client to registry server (port 3000)
- tRPC procedures for session management

**Existing Routers**:
- `hook` - Session, content, review status, presence
- `subscription` - Polling for agents without hooks
- `plan` - Plan CRUD operations
- `conversation` - A2A handoff

**Proposed Addition**:
```typescript
// In packages/schema/src/trpc/routers/input-request.ts

export const inputRequestRouter = router({
  create: publicProcedure
    .input(CreateInputRequestSchema)
    .output(CreateInputRequestResponseSchema)
    .mutation(async ({ input, ctx }) => {
      // Add request to Y.Doc
      // Return requestId
    }),

  getResponse: publicProcedure
    .input(GetInputResponseSchema)
    .output(InputResponseSchema)
    .query(async ({ input, ctx }) => {
      // Check if request has been answered
      // Return response if ready
    }),

  cancel: publicProcedure
    .input(CancelInputRequestSchema)
    .output(CancelInputResponseSchema)
    .mutation(async ({ input, ctx }) => {
      // Mark request as cancelled
    })
});
```

### 5.5 UI Components (HeroUI v3)

**Existing Modal Patterns**:

**HandoffConversationDialog** (`apps/web/src/components/HandoffConversationDialog.tsx`):
- HeroUI `Modal` with compound components
- Progress bars, peer selection cards
- State management with React hooks

**ApprovalPanel** (`apps/web/src/components/ApprovalPanel.tsx`):
- Popover for approve/deny pending users
- Toast notifications for new requests

**ReviewActions** (`apps/web/src/components/ReviewActions.tsx`):
- Popover with TextArea for comments
- Voice input integration
- Y.Doc transact for status updates

**Pattern to Reuse**:
```typescript
<Modal>
  <Modal.Header>
    <Modal.Title>{request.message}</Modal.Title>
  </Modal.Header>
  <Modal.Body>
    {/* Render input based on request.type */}
    {request.type === 'text' && <TextField />}
    {request.type === 'choice' && <RadioGroup />}
    {request.type === 'confirm' && <ConfirmButtons />}
  </Modal.Body>
  <Modal.Footer>
    <Button onPress={handleCancel}>Cancel</Button>
    <Button onPress={handleSubmit}>Submit</Button>
  </Modal.Footer>
</Modal>
```

### 5.6 Toast Notifications (Sonner)

**Library**: `sonner`
**Usage**: `apps/web/src/hooks/usePendingUserNotifications.ts`

**Pattern**:
```typescript
import { toast } from 'sonner';

toast.info('Agent is requesting input', {
  description: request.message,
  duration: 60000,  // 60 seconds
  action: {
    label: 'Respond',
    onClick: () => openInputDialog(request)
  }
});
```

**Could be used for**: Non-modal notifications that input is requested, with action button to open full modal.

---

## 6. Implementation Strategy

### Phase 1: MCP Tool (Universal Access)

**Goal**: Implement `request_user_input` MCP tool that works with ALL agents (Claude Code, Cursor, Devin, etc.)

**Approach**: Hybrid blocking pattern inspired by existing `checkReviewStatus()` flow.

#### 1.1 New MCP Tool Definition

**File**: `apps/server/src/tools/request-user-input.ts`

```typescript
import { z } from 'zod';
import { TOOL_NAMES } from './tool-names.js';

const RequestUserInputSchema = z.object({
  message: z.string().describe("The question to ask the user"),
  type: z.enum(['text', 'choice', 'confirm', 'multiline']).describe("Type of input"),
  options: z.array(z.string()).optional().describe("For choice type - available options"),
  defaultValue: z.string().optional().describe("Default value to pre-fill"),
  timeout: z.number().optional().describe("Timeout in seconds (default: 300)"),
  schema: z.record(z.unknown()).optional().describe("JSON Schema for validation"),
  planId: z.string().optional().describe("Plan ID to associate request with (optional)"),
});

server.tool(
  TOOL_NAMES.REQUEST_USER_INPUT,
  RequestUserInputSchema,
  async (args) => {
    const requestId = generateRequestId();

    // Add request to Y.Doc
    const inputRequests = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
    inputRequests.push([{
      id: requestId,
      createdAt: Date.now(),
      message: args.message,
      type: args.type,
      options: args.options,
      schema: args.schema,
      status: 'pending',
    }]);

    // Wait for response (similar to waitForReviewDecision)
    const response = await waitForInputResponse(ydoc, requestId, args.timeout || 300);

    if (response.status === 'answered') {
      return {
        success: true,
        response: response.answer
      };
    } else {
      return {
        success: false,
        reason: response.status  // 'cancelled' or 'timeout'
      };
    }
  }
);
```

#### 1.2 Blocking Helper Function

**File**: `apps/server/src/tools/wait-for-input-response.ts`

```typescript
import * as Y from 'yjs';
import { YDOC_KEYS } from '@shipyard/schema';

interface InputResponse {
  status: 'answered' | 'cancelled' | 'timeout';
  answer?: unknown;
}

export async function waitForInputResponse(
  ydoc: Y.Doc,
  requestId: string,
  timeoutSeconds: number
): Promise<InputResponse> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    const checkResponse = () => {
      const inputRequests = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      const requests = inputRequests.toJSON() as InputRequest[];
      const request = requests.find(r => r.id === requestId);

      if (!request) {
        resolve({ status: 'cancelled' });
        return true;  // Stop observing
      }

      if (request.status === 'answered') {
        resolve({
          status: 'answered',
          answer: request.response
        });
        return true;
      }

      if (request.status === 'cancelled') {
        resolve({ status: 'cancelled' });
        return true;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        // Mark as cancelled in Y.Doc
        const index = requests.findIndex(r => r.id === requestId);
        ydoc.transact(() => {
          inputRequests.delete(index, 1);
          inputRequests.insert(index, [{
            ...request,
            status: 'cancelled'
          }]);
        });
        resolve({ status: 'timeout' });
        return true;
      }

      return false;  // Keep observing
    };

    // Initial check
    if (checkResponse()) return;

    // Observe updates
    const unsubscribe = ydoc.on('update', () => {
      if (checkResponse()) {
        unsubscribe();
      }
    });

    // Cleanup timeout
    setTimeout(() => {
      unsubscribe();
      if (!checkResponse()) {
        resolve({ status: 'timeout' });
      }
    }, timeoutMs);
  });
}
```

#### 1.3 Y.Doc Schema Updates

**File**: `packages/schema/src/yjs-keys.ts`

```typescript
export const YDOC_KEYS = {
  // ... existing keys ...
  INPUT_REQUESTS: 'inputRequests',
} as const;
```

**File**: `packages/schema/src/input-request.ts` (new)

```typescript
import { z } from 'zod';

export const InputRequestSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  message: z.string(),
  type: z.enum(['text', 'choice', 'confirm', 'multiline']),
  options: z.array(z.string()).optional(),
  schema: z.record(z.unknown()).optional(),
  defaultValue: z.string().optional(),
  status: z.enum(['pending', 'answered', 'cancelled']),
  response: z.unknown().optional(),
  answeredAt: z.number().optional(),
  answeredBy: z.string().optional(),
});

export type InputRequest = z.infer<typeof InputRequestSchema>;

// Helper functions
export function createInputRequest(
  message: string,
  type: InputRequest['type'],
  options?: {
    options?: string[];
    schema?: Record<string, unknown>;
    defaultValue?: string;
  }
): InputRequest {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    message,
    type,
    options: options?.options,
    schema: options?.schema,
    defaultValue: options?.defaultValue,
    status: 'pending',
  };
}
```

#### 1.4 Browser UI Component

**File**: `apps/web/src/components/InputRequestModal.tsx` (new)

```typescript
import { Button, Input, Modal, RadioGroup, TextArea } from '@heroui/react';
import { YDOC_KEYS, type InputRequest } from '@shipyard/schema';
import { useState } from 'react';
import type * as Y from 'yjs';

interface InputRequestModalProps {
  request: InputRequest;
  ydoc: Y.Doc;
  userIdentity: { id: string; name: string } | null;
}

export function InputRequestModal({ request, ydoc, userIdentity }: InputRequestModalProps) {
  const [inputValue, setInputValue] = useState(request.defaultValue || '');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!userIdentity) return;

    const response = request.type === 'choice' ? selectedChoice : inputValue;

    // Update Y.Doc with response
    ydoc.transact(() => {
      const inputRequests = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      const requests = inputRequests.toJSON() as InputRequest[];
      const index = requests.findIndex(r => r.id === request.id);

      if (index !== -1) {
        inputRequests.delete(index, 1);
        inputRequests.insert(index, [{
          ...request,
          status: 'answered',
          response,
          answeredAt: Date.now(),
          answeredBy: userIdentity.name,
        }]);
      }
    });
  };

  const handleCancel = () => {
    ydoc.transact(() => {
      const inputRequests = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      const requests = inputRequests.toJSON() as InputRequest[];
      const index = requests.findIndex(r => r.id === request.id);

      if (index !== -1) {
        inputRequests.delete(index, 1);
        inputRequests.insert(index, [{
          ...request,
          status: 'cancelled',
        }]);
      }
    });
  };

  return (
    <Modal isOpen>
      <Modal.Header>
        <Modal.Title>Agent is requesting input</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-4">{request.message}</p>

        {request.type === 'text' && (
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
        )}

        {request.type === 'multiline' && (
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            minRows={4}
            autoFocus
          />
        )}

        {request.type === 'choice' && (
          <RadioGroup
            value={selectedChoice}
            onValueChange={setSelectedChoice}
          >
            {request.options?.map(opt => (
              <RadioGroup.Item key={opt} value={opt}>
                {opt}
              </RadioGroup.Item>
            ))}
          </RadioGroup>
        )}

        {request.type === 'confirm' && (
          <div className="flex gap-2">
            <Button onPress={() => { setInputValue('yes'); handleSubmit(); }}>
              Yes
            </Button>
            <Button onPress={() => { setInputValue('no'); handleSubmit(); }} variant="secondary">
              No
            </Button>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {request.type !== 'confirm' && (
          <>
            <Button onPress={handleCancel} variant="secondary">
              Cancel
            </Button>
            <Button onPress={handleSubmit} variant="primary">
              Submit
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
```

#### 1.5 React Hook for Pending Requests

**File**: `apps/web/src/hooks/useInputRequests.ts` (new)

```typescript
import { YDOC_KEYS, type InputRequest } from '@shipyard/schema';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';

export function useInputRequests(ydoc: Y.Doc | null) {
  const [requests, setRequests] = useState<InputRequest[]>([]);

  useEffect(() => {
    if (!ydoc) return;

    const inputRequests = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);

    const updateRequests = () => {
      const allRequests = inputRequests.toJSON() as InputRequest[];
      const pending = allRequests.filter(r => r.status === 'pending');
      setRequests(pending);

      // Show toast for new requests
      pending.forEach(req => {
        const toastId = `input-request-${req.id}`;
        if (!document.querySelector(`[data-toast-id="${toastId}"]`)) {
          toast.info('Agent needs your input', {
            id: toastId,
            description: req.message,
            duration: 60000,  // 60 seconds
            action: {
              label: 'Respond',
              onClick: () => {
                // Trigger modal open
                document.dispatchEvent(
                  new CustomEvent('open-input-request', { detail: req })
                );
              }
            }
          });
        }
      });
    };

    updateRequests();
    const unsubscribe = inputRequests.observe(updateRequests);

    return () => {
      unsubscribe();
    };
  }, [ydoc]);

  return { requests };
}
```

---

### Phase 2: Claude Code Hook Integration

**Goal**: Automatically surface MCP input requests through Claude Code's native UI patterns.

#### 2.1 Intercept via PreToolUse Hook

**Challenge**: Claude Code hooks can intercept tool calls, but `request_user_input` happens on the server.

**Idea**: Hook could detect when Claude is about to call `request_user_input` and redirect to `AskUserQuestion` instead.

**File**: `apps/hook/src/adapters/claude-code.ts`

```typescript
function handlePreToolUse(input: ClaudeCodeHookInput): AdapterEvent {
  const toolName = input.tool_name;

  // Intercept request_user_input calls
  if (toolName === 'request_user_input') {
    // Transform to AskUserQuestion format
    const mcpInput = input.tool_input as RequestUserInputParams;

    // Block and return modified tool call
    return {
      type: 'transform_tool',
      originalTool: 'request_user_input',
      newTool: 'AskUserQuestion',
      newInput: transformToAskUserQuestion(mcpInput)
    };
  }

  return { type: 'passthrough' };
}

function transformToAskUserQuestion(input: RequestUserInputParams) {
  if (input.type === 'choice') {
    return {
      questions: [{
        question: input.message,
        header: input.message.slice(0, 12),
        multiSelect: false,
        options: input.options!.map(opt => ({
          label: opt,
          description: opt
        }))
      }]
    };
  }

  // For text/multiline/confirm, we can't fully emulate
  // Would need to use choice with predefined answers
  throw new Error('Only choice type supported via AskUserQuestion transformation');
}
```

**Limitation**: `AskUserQuestion` only supports multiple-choice, not freeform text. This transformation only works for `type: 'choice'`.

#### 2.2 Alternative: Inject Context After Request

**Better approach**: Let the MCP tool execute normally, but inject the response into Claude's context via PostToolUse.

**File**: `apps/hook/src/adapters/claude-code.ts`

```typescript
function handlePostToolUse(input: ClaudeCodeHookInput): AdapterEvent {
  const sessionId = input.session_id;
  const toolName = input.tool_name;

  // After request_user_input completes
  if (toolName === 'request_user_input') {
    // Get the response from session state
    const state = getSessionState(sessionId);
    if (state?.lastInputResponse) {
      return {
        type: 'post_exit',
        sessionId,
        additionalContext: `User responded: ${state.lastInputResponse}`
      };
    }
  }

  return { type: 'passthrough' };
}
```

**Challenge**: This doesn't give Claude Code a native UI - the modal still shows in the browser.

#### 2.3 Recommended Approach: Accept Limitation

**Recommendation**: For Phase 2, **document the limitation** that the modal appears in the browser, not natively in Claude Code's UI.

**Future**: When Claude Code adds elicitation support (Issue #2799), our MCP tool will automatically use the native UI.

**Interim solution**: Provide `AskUserQuestion` compatibility layer for simple choice-based requests.

---

### Phase 3: UI/UX Design

**Goal**: Create accessible, keyboard-navigable modal that follows WCAG 2.1 AA guidelines.

#### 3.1 Modal Component Requirements

**Based on Issue #72 Success Criteria**:
- Modal overlay in plan viewer
- Shows agent question + input fields
- Action buttons with keyboard shortcuts
- Integrates with existing sidebar
- Timeout handling (shows countdown)

**Accessibility Requirements** (WCAG 2.1 AA):
- Focus trap within modal
- ESC key closes modal (= cancel)
- Tab navigation through fields
- Enter submits (where appropriate)
- ARIA labels on all inputs
- Screen reader announcements for state changes

#### 3.2 UI Mockup

**Text Input Type**:
```
┌───────────────────────────────────────────┐
│ Agent is requesting input            [×]  │
├───────────────────────────────────────────┤
│                                           │
│ What is the database connection string?   │
│                                           │
│ ┌───────────────────────────────────────┐ │
│ │ postgresql://localhost/mydb           │ │
│ └───────────────────────────────────────┘ │
│                                           │
│                    [Cancel]  [Submit]     │
│                                           │
│ Timeout: 4:32 remaining                   │
└───────────────────────────────────────────┘
```

**Choice Type**:
```
┌───────────────────────────────────────────┐
│ Agent is requesting input            [×]  │
├───────────────────────────────────────────┤
│                                           │
│ Which database should we use?             │
│                                           │
│ ◯ PostgreSQL                              │
│   Full-featured relational database       │
│                                           │
│ ◉ SQLite (Recommended)                    │
│   Lightweight, no server needed           │
│                                           │
│ ◯ MongoDB                                 │
│   Document-oriented NoSQL                 │
│                                           │
│                    [Cancel]  [Confirm]    │
│                                           │
└───────────────────────────────────────────┘
```

**Confirm Type**:
```
┌───────────────────────────────────────────┐
│ Agent is requesting confirmation     [×]  │
├───────────────────────────────────────────┤
│                                           │
│ This will delete 15 files. Continue?      │
│                                           │
│              [No]  [Yes]                  │
│                                           │
└───────────────────────────────────────────┘
```

#### 3.3 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Tab | Navigate between options/fields |
| Enter | Submit (if single field or choice selected) |
| Escape | Cancel request |
| Arrow Up/Down | Navigate options (choice type) |
| Space | Toggle option (choice type) |

#### 3.4 Toast Notification Pattern

When input request arrives, show non-modal toast first:

```typescript
toast.info('Agent needs your input', {
  description: request.message,
  duration: 60000,  // 60 seconds before auto-dismiss
  action: {
    label: 'Respond',
    onClick: () => openInputModal(request.id)
  }
});
```

**After 60 seconds**: Toast auto-dismisses, modal remains open (with countdown timer).

**On modal submit/cancel**: Dismiss toast.

---

## 7. Comparison Matrix

### Feature Comparison

| Feature | MCP Elicitation | Claude AskUserQuestion | Our Phase 1 | Our Phase 2 (Hook) |
|---------|----------------|----------------------|-------------|-------------------|
| **Protocol** | Official MCP | Claude Code internal | MCP tool | Claude Code hook |
| **Transport** | JSON-RPC | stdio | JSON-RPC | stdio hook JSON |
| **UI Location** | Client-rendered | Claude Code native | Browser modal | Browser modal |
| **Blocking** | Yes (Promise) | Yes (60s timeout) | Yes (Y.Doc observer) | Yes (Y.Doc observer) |
| **Schema Validation** | JSON Schema | Fixed format | JSON Schema | Transform to AskUserQuestion |
| **Freeform Text** | Yes | No (choice only) | Yes | No (via AskUserQuestion) |
| **Multiple Choice** | Yes | Yes | Yes | Yes |
| **Confirmation** | Yes | No (use choice) | Yes | Transform to choice |
| **Multi-Select** | Yes (array enum) | Yes (`multiSelect: true`) | Yes | Yes |
| **Timeout** | Server-defined | 60s fixed | Configurable | 60s fixed |
| **Cancel Action** | Yes | Yes | Yes | Yes |
| **Decline vs Cancel** | Separate | Not distinguished | Separate | Map to cancel |
| **Claude Code Support** | No (Issue #2799) | Yes | Yes (via tool) | Yes (via hook) |
| **Universal Agent Support** | Yes (if supported) | No (Claude only) | Yes | No (Claude only) |

### Implementation Complexity

| Approach | Effort | Pros | Cons |
|----------|--------|------|------|
| **MCP Elicitation** (official spec) | High (3-4 days) | Standard, future-proof | Claude Code doesn't support yet |
| **MCP Tool** (our Phase 1) | Medium (2-3 days) | Works everywhere, universal | Browser modal (not native) |
| **Hook Transform** (our Phase 2) | Low (1 day) | Uses Claude native UI | Choice-only, Claude-specific |
| **GUI Tool** (user-prompt-mcp style) | Low (1 day) | Simple, works | Platform-specific, not integrated |

---

## 8. HITL Best Practices

Based on research from HumanLayer, KnowNo, HULA, CopilotKit:

### When to Request Input (Strategic Checkpoints)

✅ **DO request input when:**
- Agent confidence is below threshold (use confidence scoring)
- Irreversible operations (deletes, deploys, payments)
- Multiple equally-valid approaches exist
- Technical preferences needed (library choice, styling approach)
- Ambiguous requirements that can't be researched

❌ **DON'T request input when:**
- Information can be found via tool calls (read files, search docs)
- Reasonable defaults exist and user can change later
- Agent can safely assume based on common patterns
- Question would block flow for non-critical detail

### Confidence-Based Escalation Pattern

```typescript
// Inspired by Devin's approach
function shouldAskUser(task: Task, confidence: number): boolean {
  const CONFIDENCE_THRESHOLD = 0.7;

  // Always ask for destructive operations
  if (task.isDestructive) return true;

  // Always ask if multiple approaches with no clear winner
  if (task.approaches.length > 1 && !task.recommendedApproach) return true;

  // Ask if low confidence
  if (confidence < CONFIDENCE_THRESHOLD) return true;

  // Otherwise proceed autonomously
  return false;
}
```

### Feedback Loop for Learning

**Pattern**: Feed declined/cancelled responses back to agent context:

```typescript
if (response.action === 'decline') {
  return {
    success: false,
    message: `User declined: ${response.reason || 'No reason provided'}. Try a different approach.`
  };
}
```

This allows the agent to learn from rejections and adjust strategy.

---

## 9. Implementation Recommendations

### Phase 1: MCP Tool (Priority 1)

**Why first**: Universal access for all agents (Claude Code, Cursor, Devin, etc.)

**Deliverables**:
1. `request_user_input` MCP tool
2. Y.Doc schema extension (`INPUT_REQUESTS` key)
3. `waitForInputResponse()` blocking helper
4. Browser `InputRequestModal` component
5. `useInputRequests` hook for monitoring
6. Toast notification integration
7. Unit tests + integration tests

**Estimated Effort**: 2-3 days

**Success Criteria**:
- Agent calls `request_user_input()` tool
- Modal appears in browser
- User responds → tool returns response
- Timeout works (returns after N seconds)
- Multiple request types supported (text, choice, confirm, multiline)
- Keyboard accessible (WCAG 2.1 AA)

### Phase 2: Hook Transform Layer (Priority 2)

**Why second**: Enhanced UX for Claude Code users (most common case).

**Approach**: Transform `type: 'choice'` requests to `AskUserQuestion` format.

**Deliverables**:
1. PreToolUse hook handler for `request_user_input`
2. Transform function: MCP format → `AskUserQuestion` format
3. Documentation of limitations (choice-only)
4. Fallback to Phase 1 for unsupported types

**Estimated Effort**: 1 day

**Success Criteria**:
- Claude Code users see native `AskUserQuestion` UI for choice requests
- Text/multiline/confirm requests fall back to browser modal
- Hook logs transformation for debugging

### Phase 3: MCP Elicitation Support (Future)

**When**: After Claude Code implements elicitation (Issue #2799).

**Migration Path**:
1. Add elicitation capability declaration
2. Implement `elicitation/create` handler
3. Keep `request_user_input` tool as legacy fallback
4. Document migration for existing users

**Estimated Effort**: 1-2 days

---

## 10. Open Questions

1. **Association with Plans**:
   - Should input requests always be associated with a plan?
   - Or support global/session-level requests?

2. **Multiple Concurrent Requests**:
   - Queue them? Or show all modals at once?
   - Priority system for urgent requests?

3. **Persistence**:
   - Should answered requests be kept in Y.Doc history?
   - Or removed after response (ephemeral)?

4. **Agent Resume**:
   - How does agent know a request is pending?
   - Proactive notification? Or agent must poll?

5. **Validation Errors**:
   - If user submits invalid data (violates schema), show error in modal?
   - Or let agent handle validation error?

---

## Sources

### MCP Specification
- [MCP Elicitation Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
- [MCP Sampling Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/client/sampling)
- [MCP Prompts Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)
- [One Year of MCP Blog Post](http://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/)
- [MCP 2025-06-18 Spec Update - Forge Code](https://forgecode.dev/blog/mcp-spec-updates/)

### Claude Code
- [Internal Claude Code Tools (Gist)](https://gist.github.com/bgauryy/0cdb9aa337d01ae5bd0c803943aa36bd)
- [AskUserQuestion Missing Docs - Issue #10346](https://github.com/anthropics/claude-code/issues/10346)
- [Elicitation Support Request - Issue #2799](https://github.com/anthropics/claude-code/issues/2799)
- [Claude Code System Prompts - AskUserQuestion](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-askuserquestion.md)
- [Claude Code Hooks Mastery](https://github.com/disler/claude-code-hooks-mastery)
- [Torq Software - AskUserQuestion Guide](https://torqsoftware.com/blog/2026/2026-01-14-claude-ask-user-question/)

### Claude Agent SDK
- [Handle Approvals and User Input](https://platform.claude.com/docs/en/agent-sdk/user-input)
- [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Agent SDK Python Reference](https://platform.claude.com/docs/en/agent-sdk/python)
- [Custom Tools Guide](https://platform.claude.com/docs/en/agent-sdk/custom-tools)
- [AskUserQuestion Tool - Issue #327](https://github.com/anthropics/claude-agent-sdk-python/issues/327)

### MCP Implementations
- [oneryalcin/claude-ask-user-demo](https://github.com/oneryalcin/claude-ask-user-demo)
- [Building Interactive Tools for the Agent SDK - Medium](https://medium.com/@oneryalcin/when-claude-cant-ask-building-interactive-tools-for-the-agent-sdk-64ccc89558fa)
- [paulp-o/ask-user-questions-mcp](https://github.com/paulp-o/ask-user-questions-mcp)
- [nazar256/user-prompt-mcp](https://github.com/nazar256/user-prompt-mcp)
- [goldensansapple/prompt-for-user-input-mcp](https://github.com/goldensansapple/prompt-for-user-input-mcp)
- [GongRzhe/Human-In-the-Loop-MCP-Server](https://github.com/GongRzhe/Human-In-the-Loop-MCP-Server)
- [systempromptio/systemprompt-mcp-server](https://github.com/systempromptio/systemprompt-mcp-server)
- [MCP Elicitation HITL Guide - DEV](https://dev.to/kachurun/mcp-elicitation-human-in-the-loop-for-mcp-servers-m6a)
- [Building Interactive MCP Tools - Nick Perkins](https://nickperkins.au/code/mcp-elicitations-interactive-tools/)
- [WorkOS MCP Features Guide](https://workos.com/blog/mcp-features-guide)
- [Glama - Interactive MCP](https://glama.ai/mcp/servers/@ttommyth/interactive-mcp/tools/request_user_input)
- [LobeHub MCP Servers - AUQ](https://lobehub.com/mcp/paulp-o-ask-user-questions-mcp)

### Other AI Assistants
- [Cursor System Prompts (unofficial)](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools)
- [Cursor Prompting Rules Gist](https://gist.github.com/aashari/07cc9c1b6c0debbeb4f4d94a3a81339e)
- [Devin Agents 101](https://devin.ai/agents101)
- [Devin Docs - First Session](https://docs.devin.ai/get-started/first-run)
- [Cline Tools Guide](https://docs.cline.bot/exploring-clines-tools/cline-tools-guide)
- [Cline GitHub](https://github.com/cline/cline)
- [Continue GitHub](https://github.com/continuedev/continue)
- [Aider Docs](https://aider.chat/docs/)
- [Aider GitHub](https://github.com/Aider-AI/aider)
- [Copilot - Asking Questions](https://docs.github.com/en/copilot/using-github-copilot/asking-github-copilot-questions-in-your-ide)
- [Copilot Code Reviews Discussion](https://github.com/orgs/community/discussions/166504)

### HITL Patterns
- [CopilotKit HITL Docs](https://docs.copilotkit.ai/human-in-the-loop)
- [CAMEL AI HITL Guide - DEV Community](https://dev.to/camelai/agents-with-human-in-the-loop-everything-you-need-to-know-3fo5)
- [Human in the Loop AI - WitnessAI](https://witness.ai/blog/human-in-the-loop-ai/)
- [Zapier HITL Workflows](https://zapier.com/blog/human-in-the-loop/)
- [IBM - What Is Human In The Loop](https://www.ibm.com/think/topics/human-in-the-loop)

---

*Research completed: 2026-01-16 by 5 parallel research agents*
