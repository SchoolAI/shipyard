# Plugin & Extension Ecosystem

**Created:** 2026-02-21
**Status:** Research Complete — Architecture Designed
**Scope:** Plugin taxonomy, protocol stack (MCP/ACP/A2A), 6 extension categories, event infrastructure, phased rollout

---

## Executive Summary

Shipyard's plugin ecosystem builds on three industry-standard protocols rather than inventing custom extension points:

- **MCP** (Model Context Protocol) — how agents talk to tools (Anthropic + OpenAI + Google + Microsoft)
- **ACP** (Agent Client Protocol) — how Shipyard talks to agents (Zed + JetBrains + Google + Amazon)
- **A2A** (Agent-to-Agent) — how agents delegate to other agents (Google, 150+ organizations)

Six plugin categories cover everything from 2-minute themes to week-long runtime integrations:

| # | Category | Format | Author Effort | Portability |
|---|----------|--------|--------------|-------------|
| 1 | **Themes** | JSON color/font tokens | 2 minutes | Shipyard-only |
| 2 | **Skills** | Markdown knowledge docs | 10 minutes | Fully portable (agentskills.io) |
| 3 | **Tools** | MCP servers (any language) | 1 hour | Fully portable (MCP standard) |
| 4 | **Agents** | YAML+Markdown definitions | 30 minutes | Mostly portable (converged format) |
| 5 | **Views** | React components in UI slots | 1 day | Shipyard-only |
| 6 | **Providers** | ACP-compatible agent runtimes | 1 week+ | Cross-editor (ACP standard) |

Event infrastructure (hooks during sessions, triggers to spawn sessions) connects external services through the session server's existing Durable Object WebSocket channel.

---

## 1. The Protocol Stack

Three complementary protocols at three layers. They don't compete — each solves a different problem:

```
┌─────────────────────────────────────────────────────────────────┐
│  A2A (Agent-to-Agent Protocol)                                   │
│  How agents delegate to OTHER agents                             │
│  Google, 150+ orgs, v0.3, HTTP REST + gRPC                      │
│  Discovery: Agent Cards at /.well-known/agent.json               │
│  Parts: TextPart, FilePart, DataPart (opaque — no tool calls)    │
├─────────────────────────────────────────────────────────────────┤
│  ACP (Agent Client Protocol)                                     │
│  How EDITORS/HOSTS talk to agents                                │
│  Zed + JetBrains + Google + Amazon + Block, v0.10.8              │
│  JSON-RPC 2.0 over stdio (NDJSON), 17 registered agents         │
│  Methods: initialize, session/new, session/prompt, session/update│
│  SDKs: TypeScript, Python, Rust, Kotlin                          │
├─────────────────────────────────────────────────────────────────┤
│  MCP (Model Context Protocol)                                    │
│  How agents talk to TOOLS                                        │
│  Anthropic + OpenAI + Google + Microsoft, v2025-11-25            │
│  JSON-RPC 2.0 over stdio or Streamable HTTP                      │
│  Primitives: Tools, Resources, Prompts                           │
│  97M+ monthly SDK downloads, 5800+ servers, 300+ clients         │
└─────────────────────────────────────────────────────────────────┘
```

### How They Layer in Shipyard

```
Browser UI ──→ Daemon ──(ACP)──→ Agent Runtime (Claude, Gemini, Codex, etc.)
                 │                      │
                 │                 (MCP) │
                 │                      ▼
                 │               MCP Tool Servers (Jira, Slack, Semgrep, etc.)
                 │
                 ├──(A2A)──→ Remote agents (external services, future)
                 │
                 └──(Loro CRDT)──→ Browser (state sync)
```

### ACP Adoption (Not Zed-Only)

| Editor/Host | ACP Status |
|-------------|-----------|
| Zed | Native, production (originator) |
| JetBrains (all IDEs) | Native, production (2025.3+) |
| Amazon Kiro | Native, production |
| Google Gemini CLI | Reference implementation |
| Neovim | Via plugins (CodeCompanion, avante.nvim) |
| Emacs | Via plugin (agent-shell) |
| VS Code | Community extensions only (**not committed natively**) |

ACP Registry: 17 agents (Claude, Gemini, Codex, Copilot, Goose, Junie, Qwen, Mistral, etc.)

### Naming Disambiguation

There are **TWO protocols abbreviated "ACP"** in the AI ecosystem:
1. **Agent Client Protocol** (Zed/Google) — editor ↔ agent communication. **This is the one we adopt.**
2. **Agent Communication Protocol** (IBM Research/BeeAI) — agent ↔ agent, REST-based. Has merged into A2A under the Linux Foundation. **Not this one.**

When searching, use "Agent Client Protocol" or `agentclientprotocol.com` to find the right one.

### ACP vs Claude Agent SDK

Anthropic declined native ACP support in Claude Code (GitHub issue #6686, closed "not planned"). The `claude-agent-acp` bridge is maintained by Zed Industries. Shipyard should:

- Keep the **Agent SDK as the first-class path** for Claude Code (our primary agent today)
- Use **ACP as the standard interface** for all other agents (Gemini, Codex, Goose, etc.)
- When the daemon spawns a Claude session: `SessionManager` → Agent SDK `query()`
- When the daemon spawns anything else: `SessionManager` → ACP `ClientSideConnection`

---

## 2. The Six Plugin Categories

### Category 1: Themes

**What you create**: A JSON file with color, font, and spacing tokens.
**Where it runs**: Browser (CSS custom properties).
**Security risk**: None (constrained to CSS variable values).
**Portability**: Shipyard-only.

| Example | What It Is |
|---------|-----------|
| "Catppuccin Mocha" | Dark color scheme — `{ "colors": { "background": "#1e1e2e", "accent": "#89b4fa" } }` |
| "Compact Density" | Smaller spacing — `{ "density": { "spacing-scale": 0.75, "font-size-base": "13px" } }` |
| "High Contrast" | WCAG AAA — thick focus rings, max contrast ratios |
| "Monospace Everything" | JetBrains Mono for all text, not just code |

**Hello world**: `{ "name": "my-theme", "colors": { "background": "#1e1e2e", "foreground": "#cdd6f4" } }`

---

### Category 2: Skills

**What you create**: A markdown file with domain knowledge injected into agent system prompts.
**Where it runs**: Agent process (loaded via `settingSources: ['project']`).
**Security risk**: Low (text only, no code execution).
**Portability**: Fully portable — [agentskills.io](https://agentskills.io/specification) standard adopted by Claude Code, Codex, Gemini CLI, Cursor, Copilot (20+ tools).

| Example | What It Is |
|---------|-----------|
| "OWASP Top 10" | Security checklist for code review agents |
| "React Patterns" | Project component/hook/naming conventions |
| "API Design" | REST/OpenAPI conventions for this project |
| "TypeScript Strict Style" | Zod over type assertions, exhaustive switches |

**Hello world**: A file at `.claude/skills/be-concise/SKILL.md`:
```markdown
Keep functions under 20 lines. Prefer shorter names in small scopes.
```

**Relationship to agents**: Skills are composable knowledge units consumed by agents via the `skills:` field. A skill is a reusable prompt fragment; an agent definition is a prompt with metadata that references skills.

---

### Category 3: Tools

**What you create**: An MCP server (TypeScript, Python, or any language) exposing tools, resources, or prompts.
**Where it runs**: Daemon manages process lifecycle; agents call tools via MCP protocol.
**Security risk**: High (full OS process, no sandbox — can access filesystem, network, env vars including API keys).
**Portability**: Fully portable — MCP is an industry standard.

| Example | What It Is |
|---------|-----------|
| `linear-mcp` | Create/search/update Linear tickets |
| `slack-mcp` | Post messages to Slack channels |
| `github-actions-mcp` | Trigger workflows, check run status |
| `semgrep-mcp` | Static security analysis |
| `db-query-mcp` | Read-only SQL against localhost Postgres |

**Hello world**: A 15-line echo MCP server:
```typescript
const server = new Server({ name: "echo", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler("tools/list", async () => ({
  tools: [{ name: "echo", inputSchema: { type: "object", properties: { text: { type: "string" } } } }]
}));
server.setRequestHandler("tools/call", async (req) => ({
  content: [{ type: "text", text: req.params.arguments.text }]
}));
await server.connect(new StdioServerTransport());
```

---

### Category 4: Agents

**What you create**: A markdown file with YAML frontmatter bundling a system prompt + references to skills, tools, hooks, triggers, and permissions.
**Where it runs**: Daemon spawns via ACP/Agent SDK; agent runs as subprocess.
**Security risk**: Medium (system prompts instruct agents, but tool restrictions limit blast radius).
**Portability**: Mostly portable — converged markdown+YAML format across 4/5 CLI tools (Claude Code, Gemini CLI, Cursor, Copilot). Shipyard-specific fields (`hooks:`, `triggers:`) ignored by other tools.

**The full agent definition schema**:
```yaml
---
name: ticket-worker                    # Required. Lowercase + hyphens.
description: "Works Linear tickets"    # Required. Used for delegation decisions.

# What it knows
skills:
  - linear-workflow
  - pr-conventions

# What it can call
tools: Read, Write, Edit, Glob, Grep, Bash, Task
mcpServers:
  - linear-mcp
  - slack-mcp
  - github-mcp

# How it runs
model: claude-opus-4-6                 # sonnet | opus | haiku | inherit
permissionMode: acceptEdits            # default | acceptEdits | bypassPermissions | plan
maxTurns: 50
isolation: worktree                    # Optional: run in git worktree
memory: project                        # Optional: persistent cross-session learning
background: false                      # Optional: always run in background

# What happens during execution
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./hooks/run-affected-tests.sh"
  SessionEnd:
    - hooks:
        - type: command
          command: "./hooks/auto-pr-and-notify.sh"

# When to auto-spawn (external events)
triggers:
  - source: linear
    event: issue.assigned
    filter:
      assignee: "agent"
    spawn:
      prompt: "Work on Linear ticket {{issue.identifier}}: {{issue.title}}"
  - source: schedule
    cron: "0 9 * * 1"
    spawn:
      prompt: "Check for outdated dependencies and create upgrade PRs"

# Plugin settings (user-configurable)
settings:
  linear_team:
    type: string
    label: "Linear Team ID"
    required: true
  slack_channel:
    type: string
    label: "Notification Channel"
    default: "#engineering"
---

You are a developer working from Linear tickets.

## Workflow
1. Read the Linear ticket thoroughly using `get_issue`
2. Update ticket status to "In Progress"
3. Explore the codebase to understand the relevant code
4. Create a plan and wait for human approval
5. Implement the approved plan
6. Run the full test suite
7. Summarize your changes for the PR description

## Rules
- Never skip reading the ticket first
- Always run tests before marking complete
- If you find unrelated bugs, file new Linear tickets (don't fix them)
```

**Concrete agent examples**:

| Agent | Skills | Tools | Hooks |
|-------|--------|-------|-------|
| "Security Reviewer" | owasp-top-10 | semgrep-mcp | Spawns after main agent completes |
| "Doc Writer" | api-design | — (Read/Write only) | — |
| "Test Generator" | engineering-standards | — | test-on-edit |
| "Full Stack Expert" | react-patterns + api-design + ts-strict | jira + slack + github-actions | auto-PR on complete, lint on edit |

**Hello world**:
```yaml
---
name: greeter
description: "Responds to greetings politely"
tools: Read
---
You are friendly. Say hello.
```

**Remote A2A agents** (future):
```yaml
---
name: external-reviewer
description: "External code review service"
kind: remote
agentCardUrl: https://review-service.example.com/.well-known/agent.json
---
```

---

### Category 5: Views

**What you create**: React components that plug into specific Shipyard UI slots.
**Where it runs**: Browser.
**Security risk**: High for editor extensions (CRDT corruption), medium for panels, low for renderers.
**Portability**: Shipyard-only.

| UI Slot | Example | What It Does |
|---------|---------|-------------|
| **Chat renderer** | SQL Results Table | Renders `db_query` tool output as a sortable table |
| **Chat renderer** | Test Results Badges | Green/red pass/fail badges for `run_tests` output |
| **Chat renderer** | Interactive Deploy | "Deploy to staging?" with Approve/Cancel buttons |
| **Sidebar panel** | Deployment Dashboard | Shows deploy status, trigger deploys |
| **Sidebar panel** | Cost Tracker | Agent token usage and cost per session |
| **Diff viewer** | Side-by-Side Diff | Alternative diff rendering mode |
| **Diff viewer** | Semantic Diff | AST-aware diff that ignores formatting |
| **Approval flow** | Checklist Approval | Review plan as checkbox list, approve each step |
| **Approval flow** | Inline Review | Per-file, per-hunk code review style |
| **Command palette** | "Deploy to Staging" | Action command triggered from palette |
| **Command palette** | "Search Jira" | Search provider querying Jira API |
| **Slash command** | `/deploy staging` | Chat input command that triggers deployment agent |
| **Slash command** | `/jira PROJ-123` | Fetches and displays a Jira ticket inline |
| **Editor extension** | Mermaid Diagrams | Renders mermaid code blocks as diagrams in TipTap |

**Existing extension points in codebase**:
- `CommandProvider` type (`apps/web/src/components/command-palette/types.ts`)
- `SlashCommandItem` / `SlashCommandAction` (`apps/web/src/hooks/use-slash-commands.ts`)
- `createExtensions()` (`apps/web/src/editor/extensions.ts`)
- `TOOL_SUMMARIZERS` (`apps/web/src/utils/tool-summarizers.ts`)
- `SidePanelId` union (`apps/web/src/stores/ui-store.ts`)
- `PlanApprovalContext` (`apps/web/src/contexts/plan-approval-context.tsx`)

**CRDT safety warning**: Editor extensions (TipTap/ProseMirror plugins) run in the main thread with direct Loro document write access. A buggy extension can corrupt CRDT state that propagates to ALL peers. **Editor extensions must be first-party only** until a sandboxing strategy exists.

**Future sandboxing model**: When community Views are needed, adopt Figma's dual-context approach: plugin logic runs in a sandbox (iframe or Web Worker) with a read-only typed API to CRDT state, while plugin UI renders in a separate iframe communicating via `postMessage`. The logic sandbox can request CRDT writes through a controlled API that validates operations before applying them. This prevents direct document corruption while preserving plugin capability.

**Hello world**: A sidebar panel that says "Hello from a plugin!"

---

### Category 6: Providers

**What you create**: An ACP-compatible agent runtime.
**Where it runs**: Daemon spawns as subprocess, communicates via ACP stdio.
**Security risk**: Very high (full agent execution capability).
**Portability**: Cross-editor — ACP agents work in Zed, JetBrains, Kiro, Neovim, etc.

| Provider | Agent | ACP Status |
|----------|-------|-----------|
| Claude Code | claude-acp | Via Zed's bridge (Anthropic declined native ACP) |
| Gemini CLI | gemini | Native ACP (reference implementation) |
| Codex CLI | codex-acp | Community bridge |
| Goose | goose | Native ACP |
| Junie | junie-acp | JetBrains |
| Copilot | github-copilot | In ACP registry |
| + 11 more | Various | In ACP registry |

**How the daemon uses providers**:
```
SessionManager.createSession(opts)
       │
       ├─ if provider == 'claude'
       │     → Agent SDK query() (first-class, full fidelity)
       │
       └─ if provider == anything else
             → ACP ClientSideConnection (standard protocol)
               → spawn subprocess
               → initialize → authenticate → session/new → session/prompt
               → stream session/update notifications
               → handle requestPermission
```

**ACP message lifecycle**:
```
Shipyard Daemon (ACP Client)              Agent (ACP Server)
         │                                       │
         │─── initialize ──────────────────────→  │
         │←── InitializeResponse ──────────────   │
         │─── session/new ─────────────────────→  │
         │←── { sessionId } ───────────────────   │
         │─── session/prompt ──────────────────→  │
         │←── session/update (agent_message) ──   │
         │←── session/update (tool_call) ──────   │
         │←── requestPermission ───────────────   │
         │─── PermissionResponse ──────────────→  │
         │←── session/update (tool_call_update)   │
         │←── PromptResponse { stopReason } ───   │
```

**Capability degradation**: Different providers support different features:

| Feature | Claude (SDK) | Gemini (ACP) | Codex (ACP) | Goose (ACP) |
|---------|-------------|-------------|-------------|-------------|
| MCP tools | Yes | Yes | Yes | Yes |
| Hooks | Yes (11 events) | No | Limited | No |
| Sub-agents | Yes | No | Yes | No |
| Session resume | Yes | No | No | No |
| Skills (system prompt) | Yes | Yes | Yes | Yes |
| Permission modes | 4 modes | 2 modes | 3 modes | 2 modes |

When an agent definition requires features the provider doesn't support (e.g., hooks on Gemini), the daemon degrades gracefully — hooks are skipped, a warning is logged.

---

## 3. Event Infrastructure

### Hooks (During Agent Sessions)

Hooks fire during agent execution. They're scoped per-agent (in the agent definition's `hooks:` field) or project-wide (in `.claude/settings.json`).

| Hook Event | When It Fires | Example Use |
|-----------|--------------|-------------|
| `SessionStart` | Agent session begins | Inject docs, update external tracker |
| `SessionEnd` | Agent completes/fails | Auto-create PR, notify Slack, close ticket |
| `PreToolUse` | Before a tool executes | Block `rm -rf`, validate inputs |
| `PostToolUse` | After a tool completes | Run tests on edit, audit logging |
| `SubagentStart` | Subagent spawns | Track parallel work |
| `SubagentStop` | Subagent completes | Aggregate results |
| `Notification` | Status update | External notifications |
| `PreCompact` | Before context compaction | Archive full transcript |
| `PermissionRequest` | Permission dialog | Custom auth logic |

Hooks can:
- Return `permissionDecision: "allow" | "deny" | "ask"`
- Inject `systemMessage` strings into agent context
- Modify tool inputs via `updatedInput`

### Triggers (Spawn Agent Sessions)

Triggers start NEW sessions from external events. They're declared in agent definitions (`triggers:` field).

| Trigger Source | How It Arrives | Example |
|---------------|---------------|---------|
| **Webhook** (Linear, GitHub, Slack) | External service → CF Worker → PersonalRoom DO → WebSocket → Daemon | Ticket assigned → spawn agent |
| **Scheduled** (cron) | CF Worker Cron Trigger → PersonalRoom DO → WebSocket → Daemon | Monday 9am → dependency update |
| **Manual** (browser) | Browser UI → Loro CRDT → Daemon subscribes | User clicks "Start" |
| **Agent event** (hook) | Hook in one session spawns another | Main agent completes → spawn security reviewer |

### External Event Pipeline

```
External Service (Linear, GitHub, Slack)
       │
       │  POST https://session.shipyard.so/webhooks/{userId}/{source}
       │
       ▼
CF Worker (webhook ingress)
       │  Validates signature (per-source verification)
       │  Routes by userId to their PersonalRoom DO
       ▼
PersonalRoom DO
       │  Stores event in DO storage (durable)
       │  If daemon connected: push immediately via WebSocket
       │  If daemon offline: queue, deliver on reconnect
       │  Cloudflare Queues for durability
       ▼
Daemon
       │  Matches event against trigger configs in agent definitions
       │  Spawns agent with context from event payload
       ▼
Agent session starts
```

No ngrok, no polling. The daemon is already connected to the session server via WebSocket for signaling. Webhook events route through the same channel.

---

## 4. Cross-Cutting Concerns

These apply to ALL plugin categories — they're platform infrastructure, not categories themselves.

### Settings & Configuration

Plugins declare configurable settings in their manifest. The browser UI auto-generates a settings form.

```yaml
settings:
  jira_url:
    type: string
    label: "Jira Instance URL"
    required: true
    placeholder: "https://yourcompany.atlassian.net"
  jira_token:
    type: secret
    label: "Jira API Token"
    required: true
  default_project:
    type: string
    label: "Default Project Key"
    default: "PROJ"
```

### Secret Management

- Daemon-side secret store (OS keychain or encrypted `~/.shipyard/secrets.json`)
- Secrets referenced by name in plugin configs, never inline
- MCP servers receive secrets as environment variables at launch
- Browser UI shows "configured" / "not configured" status, never secret values
- Secrets are per-user, never synced via CRDT

### Dependencies

Agent definitions can declare dependencies on tools and skills:

```yaml
dependencies:
  tools:
    - semgrep-mcp@^1.0
  skills:
    - owasp-top-10@^1.0
```

Install checks for dependencies, prompts to install if missing.

### Scoping

| Category | Default Scope | Why |
|----------|--------------|-----|
| Themes | Per-user | Visual preference is personal |
| Skills | Per-project or per-user | Knowledge can be shared or personal |
| Tools | Per-daemon | MCP servers need local credentials |
| Agents | Per-project or per-user | Shared agents are valuable for teams |
| Views | Per-user (browser-local) | UI extensions are personal preference |
| Providers | Per-daemon | Runtime installations are machine-specific |
| Secrets | Per-user, never synced | Privacy-critical |
| Triggers | Per-daemon | Webhooks route to specific machines |
| Hooks (project-wide) | Per-project | Team-wide automation |

### CRDT Access Model

| Category | CRDT Access | Notes |
|----------|------------|-------|
| Themes | None | Pure CSS |
| Skills | None | Pure text injected into prompt |
| Tools | Indirect | Agent writes to CRDT based on tool results; MCP server never touches Loro |
| Agents | Controlled write | Agent processes write via `SessionManager`, which controls the write path |
| Views | Read-only typed API | Views subscribe to CRDT state via Zustand selectors, no raw doc access |
| Views (editor ext) | **Direct write — DANGER** | ProseMirror plugins have raw Loro doc access; first-party only |
| Providers | None | ACP agents don't know about Loro; daemon translates |

### Observability

- Tool health status (green/red) in browser UI per MCP server
- Hook execution logs in agent session timeline
- Plugin error events in Loro CRDT for browser display
- Daemon rotating file logs (existing infrastructure from commit `8406a66`)
- Provider connection status visible in browser model picker

### Conflict Resolution

| Slot | Rule |
|------|------|
| Chat renderers | Last-installed wins (user can reorder in settings) |
| Hooks | All fire (hooks are additive, like middleware) |
| Slash commands | First match (like route matching) |
| Themes | Later overrides earlier values (merge) |
| Command palette | All providers contribute (merged result set) |

---

## 5. Plugin Manifest Format

A single `shipyard-plugin.json` manifest can contribute to multiple categories. One plugin can provide themes AND agents AND tools.

```jsonc
{
  "$schema": "https://shipyard.so/schemas/plugin-v1.json",
  "name": "security-reviewer",
  "version": "1.0.0",
  "displayName": "Security Reviewer",
  "description": "OWASP Top 10 focused code review agent with Semgrep integration",
  "author": "Shipyard Community",
  "license": "MIT",

  "contributions": {
    // Agent definitions (Category 4)
    "agents": [
      {
        "id": "security-reviewer",
        "path": "./agents/security-reviewer.md"
      }
    ],

    // Skills (Category 2)
    "skills": [
      {
        "id": "owasp-top-10",
        "path": "./skills/owasp-top-10/SKILL.md"
      }
    ],

    // MCP Tool Servers (Category 3)
    "tools": [
      {
        "id": "semgrep",
        "command": "npx",
        "args": ["@shipyard-plugins/semgrep-mcp"],
        "env": {
          "SEMGREP_TOKEN": { "required": false, "secret": true }
        },
        "scope": "agent"  // "agent" = per-session, "daemon" = shared singleton
      }
    ],

    // Themes (Category 1)
    "themes": [
      {
        "id": "security-dark",
        "label": "Security Dark",
        "path": "./themes/security-dark.json"
      }
    ],

    // View contributions (Category 5)
    "views": {
      "chatRenderers": [
        {
          "toolName": "semgrep_scan",
          "component": "./dist/SemgrepRenderer.js"
        }
      ],
      "sidebarPanels": [
        {
          "id": "security-findings",
          "label": "Security",
          "icon": "shield",
          "component": "./dist/SecurityPanel.js"
        }
      ],
      "commandProviders": [
        {
          "component": "./dist/SecurityCommands.js"
        }
      ],
      "slashCommands": [
        {
          "id": "security-scan",
          "name": "security-scan",
          "description": "Run security scan on current changes",
          "action": { "kind": "plugin", "pluginId": "security-reviewer", "commandId": "scan" }
        }
      ]
    },

    // Lifecycle Hooks
    "hooks": [
      {
        "event": "SessionEnd",
        "command": "./hooks/post-security-summary.sh"
      }
    ]
  },

  // Dependencies on other plugins
  "dependencies": {
    "tools": ["semgrep-mcp@^1.0"],
    "skills": ["owasp-top-10@^1.0"]
  },

  // User-configurable settings (auto-generates UI)
  "settings": {
    "severity_threshold": {
      "type": "string",
      "label": "Minimum Severity to Report",
      "options": ["critical", "high", "medium", "low"],
      "default": "medium"
    },
    "auto_spawn": {
      "type": "boolean",
      "label": "Auto-run after every agent session",
      "default": false
    }
  },

  // Trust/sandbox declarations
  "permissions": {
    "network": ["semgrep.dev"],
    "fileSystem": "read-only",
    "subprocess": true
  }
}
```

**Key design choices:**
- **Flat `contributions` object** — a single plugin can contribute across all categories. No artificial layering.
- **`scope` on tools** — `"agent"` (fresh per session) vs `"daemon"` (shared singleton). Matters for resource management.
- **`settings` with types** — auto-generates a configuration UI in the browser. `type: "secret"` routes to secure storage.
- **`permissions` block** — declares the security envelope. UI-only plugins declare `fileSystem: "none"` and `subprocess: false`.
- **View sub-contributions** — `chatRenderers`, `sidebarPanels`, `commandProviders`, `slashCommands` map directly to existing codebase extension points.

---

## 6. Real-World Scenario: Linear Ticket → Agent → PR → Merge

Full lifecycle demonstrating all plugin categories working together.

### Plugins Installed

- **Tools**: `linear-mcp`, `slack-mcp`, `github-mcp`, `semgrep-mcp`
- **Skills**: `linear-workflow`, `owasp-top-10`, `pr-conventions`
- **Agents**: `ticket-worker` (bundles above), `security-reviewer`
- **Views**: `ticket-dashboard` (sidebar panel)
- **Theme**: team brand colors
- **Provider**: Claude Code (Agent SDK, first-class)

### Event Chain

| Step | Event | What Fires | Plugin Types Used |
|------|-------|-----------|-------------------|
| 1 | Ticket assigned to agent in Linear | Webhook → session server → daemon → trigger spawns `ticket-worker` | Trigger + Tool (Linear MCP) |
| 2 | Agent session starts | `SessionStart` hook updates Linear status to "In Progress" | Hook + Tool (Linear MCP) |
| 3 | Agent edits a file | `PostToolUse` hook runs affected tests | Hook |
| 4 | Tests fail | Hook injects failure message, agent fixes | Hook (system message injection) |
| 5 | Agent produces plan | `PostToolUse` hook on ExitPlanMode notifies Slack | Hook + Tool (Slack MCP) |
| 6 | Human approves plan | Browser UI → Loro CRDT status change | Built-in (plan-approval-context) |
| 7 | Agent implements plan | Tests run on every edit (hook) | Hook |
| 8 | Agent completes | `SessionEnd` hook: create PR + update Linear + notify Slack + spawn security reviewer | Hook + Tool (GitHub + Linear + Slack MCP) + Agent |
| 9 | Security review runs | `security-reviewer` agent reads diff, runs Semgrep | Agent + Skill (OWASP) + Tool (Semgrep MCP) |
| 10 | Security review posts findings | Findings added as PR comments | Tool (GitHub MCP) |
| 11 | Human reviews + merges PR | GitHub webhook → session server → daemon | Trigger |
| 12 | PR merged | Hook closes Linear ticket, notifies Slack | Hook + Tool (Linear + Slack MCP) |
| 13 | Cost logged | View reads `totalCostUsd` from Loro CRDT | View (cost tracker) |

### Additional Scenarios

| # | Scenario | Themes | Skills | Tools | Agents | Views | Hooks |
|---|----------|--------|--------|-------|--------|-------|-------|
| 1 | **Auto-file Linear bugs**: Agent finds out-of-scope bug, files a Linear ticket instead of fixing it | | X | X (Linear) | opt | | |
| 2 | **PR-style code review**: Inline diff review with line-level comments and approve/reject | | X | | | X (diff reviewer) | |
| 3 | **Auto-PR + Slack notify**: Agent completes → create PR → post link to Slack | | | X (Slack, GitHub) | | | X (SessionEnd) |
| 4 | **Security second opinion**: After main agent completes, auto-spawn security reviewer on the diff | | X (OWASP) | X (Semgrep) | X (security-reviewer) | | X (SessionEnd → spawn) |
| 5 | **Jira workflow**: Agent reads Jira ticket, updates status as it works, logs time when done | | X (jira-workflow) | X (Jira) | X (jira-developer) | | |
| 6 | **Cost tracking dashboard**: See token usage and cost per session, per model, per day | | | | | X (sidebar panel) | |
| 7 | **Test-on-edit guardrails**: Run tests after every file edit, inject failures into agent context | | | | | | X (PostToolUse) |
| 8 | **Design system compliance**: Agent uses your HeroUI components and brand tokens | X (brand theme) | X (design-system) | | | | |
| 9 | **Shared team agent**: Published agent profile that team installs, centrally maintained with updates | | X | X | X (published) | | |
| 10 | **Internal API (no code)**: Drop an OpenAPI spec, generic MCP server auto-generates tools from it | | X (deploy-policy) | X (openapi-mcp) | | | |

**Pattern**: Skills and Tools are the backbone (8/10 scenarios). Agents bundle them (5/10). Hooks automate (3/10). Views add visibility (2/10). Themes are cosmetic (1/10).

---

## 6. Industry Comparison

### Subagent Definition Format Convergence

4 out of 5 tools use the same pattern: **markdown files with YAML frontmatter in `.<tool>/agents/`**:

| Feature | Claude Code | Codex CLI | Gemini CLI | Cursor | Copilot |
|---------|------------|-----------|------------|--------|---------|
| **Format** | MD+YAML | TOML (outlier) | MD+YAML | MD+YAML | MD+YAML |
| **Location** | `.claude/agents/` | `config.toml` | `.gemini/agents/` | `.cursor/agents/` | `.github/copilot/agents/` |
| **System prompt** | MD body | `developer_instructions` | MD body | MD body | MD body |
| **Model** | `sonnet\|opus\|haiku` | Full model ID | Full model ID | Full model ID | Not configurable |
| **Skills injection** | `skills:` field | Separate system | No | No | No |
| **MCP server scoping** | `mcpServers:` | No | No | No | Org/enterprise only |
| **Lifecycle hooks** | Full hook system | No | No | No | No |
| **Persistent memory** | `memory:` field | No | No | No | No |
| **Git worktree isolation** | `isolation:` field | No | No | No | No |
| **Remote A2A agents** | No | No | `kind: remote` | No | No |
| **Background execution** | `background: true` | Threads | No | `is_background: true` | No |
| **Nested subagents** | No | Yes | No | Yes | Yes |

**No marketplace/registry exists for subagent definitions in any tool.** This is the biggest unclaimed opportunity.

### Extension Model Comparison (All Platforms)

| Platform | Isolation | Extension Language | UI Plugins | AI Extensibility | Custom UI |
|----------|-----------|-------------------|------------|-----------------|-----------|
| **VS Code** | Separate process (Ext Host) | TypeScript/JS | Webviews (iframe) | Chat participants, LM tools | Full (webview panels, custom editors) |
| **Zed** | WASM sandbox (Wasmtime) | Rust → WASM | None | Context servers, slash commands | None |
| **JetBrains** | None (in-JVM) | Java/Kotlin | Swing/AWT (in-process) | AI Assistant plugins | Full (tool windows, editors) |
| **Figma** | QuickJS/WASM + iframe | JavaScript | iframe sandbox | N/A | iframe + postMessage |
| **Obsidian** | None (Electron) | TypeScript/JS | Full DOM access | N/A | Unrestricted |
| **Shipyard** | Per-category (see below) | JSON/MD/TS/MCP servers | React components | ACP agents, MCP tools, Skills | Controlled slots |

### Shipyard's Unique Position

| Capability | Who Has It | Shipyard's Angle |
|------------|-----------|------------------|
| MCP tool plugins | Everyone (standard) | Daemon manages lifecycle, browser UI for config |
| Agent Skills | Everyone (standard) | Registry/marketplace (**nobody has built this**) |
| Subagent definitions | Everyone (de facto format) | Cross-provider translation + registry (**nobody has this**) |
| Agent Profiles (bundled configs) | Nobody | Skills + MCP + hooks + triggers + permissions in one installable unit |
| ACP agent runtimes | Zed, JetBrains, Kiro | Shipyard would be the first **non-IDE** ACP client |
| External event triggers | Nobody (for AI tools) | Webhook → session server → daemon → agent spawn |
| Remote A2A agents | Only Gemini CLI (`kind: remote`) | A2A WHIP designed, Shipyard would be second |
| UI plugins for AI collaboration | Nobody | First for this product category |
| Unified view over all 6 categories | Nobody | Only tool with tool + skill + agent + provider + view + theme layers |

---

## 7. Phased Rollout

### Phase 1: Formalize What Exists (2-3 weeks)

No new runtime code. Package and surface what already works.

- [ ] Define `shipyard-plugin.json` manifest format
- [ ] Build `shipyard install/uninstall` CLI that copies files to `.claude/` directories
- [ ] Surface installed agents + skills in browser UI (read from daemon capabilities)
- [ ] Surface MCP server status in browser UI (running/stopped/error)
- [ ] Formalize theme engine (CSS custom property overrides via JSON files)
- [ ] Add dynamic model picker from daemon's `detectModels()` (already partially exists)

### Phase 2: UI Extension Points (2 months)

Clean up existing extension points, add registration.

- [ ] `PluginRegistry` for dynamic command palette providers (extend `CommandProvider`)
- [ ] Dynamic slash command registration (extend `SlashCommandAction` union)
- [ ] Custom tool output renderers (registry keyed by `toolName`, extending `TOOL_SUMMARIZERS`)
- [ ] Theme engine with CSS custom property overrides (extend `useThemeEffect`)
- [ ] Plugin-contributed sidebar panels (extend `SidePanelId`)
- [ ] Plugin settings UI (auto-generated from `settings:` schema in manifests)

### Phase 3: ACP Client + Event Infrastructure (3-4 months)

The big architectural work.

- [ ] ACP `ClientSideConnection` in daemon for non-Claude agents
- [ ] Provider registry (Claude via Agent SDK, everything else via ACP)
- [ ] ACP Registry integration (browse/install agents from registry)
- [ ] Webhook ingress on session server CF Worker
- [ ] Trigger routing through PersonalRoom DO → daemon WebSocket
- [ ] Scheduled triggers via CF Worker Cron Triggers
- [ ] Event queuing (DO storage for offline daemon delivery)
- [ ] Secret management (OS keychain, `~/.shipyard/secrets.json`)

### Phase 4: Distribution & Marketplace (6 months)

The ecosystem layer.

- [ ] Plugin registry (browse, search, install, update, rate)
- [ ] Versioning and dependency resolution
- [ ] Publishing pipeline (submit → review → publish)
- [ ] Cross-provider translation (portable agent profiles → provider-specific configs)
- [ ] Plugin update notifications in browser UI

### Defer Indefinitely

- Language extensions (LSP, Tree-sitter) — Shipyard is not an IDE
- Debugger adapters (DAP) — agents debug via Bash
- SCM providers — git is hardcoded
- WASM sandboxing for plugins — overkill for local dev tool
- Community editor extensions — CRDT corruption risk until sandboxing exists
- Authentication providers (OAuth) — infrastructure, not user plugins
- Icon themes — no file browser surface

---

## 8. Open Questions

| Question | Current Thinking | Status |
|----------|-----------------|--------|
| Should we implement ACP server too (be an agent, not just a client)? | Probably not until A2A integration — focus on being a good client | Deferred |
| How do we handle ACP agents that don't support features our agent definitions require (hooks, skills)? | Graceful degradation: skip unsupported features, warn user | Decided |
| Should the ACP Registry be the only provider source, or also support manual config? | Both — registry for discovery, manual config for custom/private agents | Decided |
| When do editor extensions graduate from first-party-only to community? | When a read-only CRDT API exists that prevents write corruption | Open |
| Should triggers be part of agent definitions or a separate config? | Part of agent definitions (self-describing, like VS Code's `activationEvents`) | Decided |
| How does plugin config sync across multiple daemons (same user, different machines)? | Secrets: never sync. Config: sync via Loro CRDT. Plugins themselves: manual install per machine | Decided |
| Should we build our own plugin registry or federate existing ones (Smithery for MCP, ACP Registry for agents, etc.)? | Aggregate — Shipyard UI as a unified view over multiple registries | Open |

---

## 9. References

### Protocol Specifications
- [MCP Specification (Nov 2025)](https://modelcontextprotocol.io/specification/2025-11-25)
- [ACP Specification](https://agentclientprotocol.com/) — v0.10.8, JSON-RPC 2.0 over stdio
- [A2A Specification](https://a2a-protocol.org/latest/specification/) — v0.3, HTTP REST + gRPC
- [Agent Skills Specification](https://agentskills.io/specification) — cross-platform, 20+ tools

### SDKs & Registries
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk) — `@agentclientprotocol/sdk`
- [ACP Registry](https://github.com/agentclientprotocol/registry) — 17 agents
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) — `@anthropic-ai/claude-agent-sdk`
- [Smithery](https://smithery.ai/) — MCP server registry
- [Glama](https://glama.ai/mcp/servers) — MCP hosting platform

### Shipyard Internal
- [A2A Integration Research WHIP](./a2a-integration-research.md) — A2A as projection layer
- [Daemon + MCP Server Merge WHIP](./daemon-mcp-server-merge.md) — Current daemon architecture
- [Architecture](../architecture.md) — Hub-and-spoke model, data hierarchy

### Industry Research
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Zed Extension Docs](https://zed.dev/docs/extensions)
- [Zed: Life of an Extension (Rust, WIT, Wasm)](https://zed.dev/blog/zed-decoded-extensions)
- [JetBrains ACP Support](https://www.jetbrains.com/help/ai-assistant/acp.html)
- [Figma Plugin System Architecture](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)
- [Claude Code Custom Agents](https://code.claude.com/docs/en/sub-agents)
- [Codex CLI Multi-Agent](https://developers.openai.com/codex/multi-agent/)
- [Gemini CLI Subagents](https://geminicli.com/docs/core/subagents/)
- [Cursor Custom Agents](https://docs.cursor.com/agents)
- [GitHub Copilot Custom Agents](https://docs.github.com/en/copilot/reference/custom-agents-configuration)

---

*Last updated: 2026-02-21*
