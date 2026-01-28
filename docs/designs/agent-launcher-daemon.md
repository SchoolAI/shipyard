# Agent Launcher Daemon Design

> Design doc for Issue #140: Trigger local agents from Shipyard browser

**Status:** Phases 1-3 Complete
**Commits:** 30d913c, f8c70cf, 64fbc93
**Next:** Phase 4 polish, then ship
**Author:** Claude + Jacob
**Date:** 2026-01-27

---

## Problem Statement

Shipyard currently works one-way: **Agent → Browser**. Agents create tasks, browser displays them, humans review.

Users want the reverse: **Browser → Agent**. Click a button in the browser to:
1. Start an agent (Claude Code, Codex, etc.) on a task
2. Monitor agent progress
3. Stop/interrupt agents when needed

**The challenge:** Browsers are sandboxed. They can't execute local binaries or start processes.

---

## Proposed Solution: Agent Launcher Daemon

A lightweight Node.js daemon that:
1. Runs in background on user's machine
2. Listens on WebSocket (localhost:9999)
3. Receives commands from browser
4. Spawns and manages agent processes

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser (Static Site)                                           │
│                                                                 │
│  "Start Agent" button → ws://localhost:9999                     │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │ WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Agent Launcher Daemon (Node.js)                                 │
│                                                                 │
│  • WebSocket server (port 9999)                                 │
│  • Agent spawner (claude, codex, etc.)                          │
│  • Process manager (start, stop, status)                        │
│  • Output streamer                                              │
│                                                                 │
└───────────────────┬─────────────────────────────────────────────┘
                    │ spawn()
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Agent Processes                                                 │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Claude Code │  │ Codex       │  │ Future...   │              │
│  │ Session 1   │  │ Session 1   │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Self-Propagating Bootstrap

**Problem:** How does the daemon get started if no agent is running?

**Solution:** The MCP server spawns a **detached** daemon on first run:

```
┌──────────────────────────────────────────────────────────────────┐
│ Bootstrap Flow (First Time)                                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User runs: claude -p "hello"                                 │
│                                                                  │
│  2. Claude Code starts MCP server (Shipyard)                     │
│                                                                  │
│  3. MCP checks: Is daemon running?                               │
│     → fetch('http://localhost:9999/health')                      │
│     → NO (timeout/404)                                           │
│                                                                  │
│  4. MCP spawns detached daemon:                                  │
│     spawn('node', ['daemon.js'], { detached: true, stdio: 'ignore' })
│     daemon.unref()                                               │
│                                                                  │
│  5. Daemon writes PID to ~/.shipyard/daemon.lock                 │
│                                                                  │
│  6. Claude Code session ends → MCP dies → Daemon SURVIVES        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Subsequent Runs                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. MCP checks: Is daemon running?                               │
│     → fetch('http://localhost:9999/health')                      │
│     → YES (200 OK)                                               │
│                                                                  │
│  2. Skip spawn, daemon already running                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Key:** `detached: true` + `unref()` allows daemon to survive parent process exit.

---

## Package Structure

Create as a new app that can also be run via npx:

```
apps/
├── daemon/                          # NEW
│   ├── src/
│   │   ├── index.ts                 # Entry point
│   │   ├── websocket-server.ts      # WebSocket handling
│   │   ├── agent-spawner.ts         # Process spawning
│   │   ├── agent-registry.ts        # Track running agents
│   │   └── lock-manager.ts          # PID file management
│   ├── package.json
│   └── tsconfig.json
├── server/                          # Existing MCP server
│   └── src/
│       └── daemon-launcher.ts       # NEW: Spawn daemon if not running
└── web/
    └── src/
        └── hooks/useDaemon.ts       # NEW: WebSocket client
```

### NPX Support

```json
// apps/daemon/package.json
{
  "name": "shipyard",
  "version": "0.1.0",
  "bin": {
    "shipyard": "./dist/index.js"
  },
  "scripts": {
    "start": "node dist/index.js"
  }
}
```

Users can run: `npx shipyard`

**Why unscoped?** Industry pattern for CLIs (vercel, turbo, pnpm, firebase-tools) uses unscoped names for ergonomics. Keep scoped names (`@schoolai/shipyard-mcp`) for libraries.

---

## WebSocket Protocol

### Message Types

```typescript
// Browser → Daemon
type ClientMessage =
  | { type: 'start-agent'; agent: 'claude-code' | 'codex'; taskId: string; prompt: string; cwd?: string }
  | { type: 'stop-agent'; taskId: string }
  | { type: 'list-agents' }
  | { type: 'get-status'; taskId: string };

// Daemon → Browser
type ServerMessage =
  | { type: 'started'; taskId: string; pid: number }
  | { type: 'output'; taskId: string; data: string; stream: 'stdout' | 'stderr' }
  | { type: 'completed'; taskId: string; exitCode: number }
  | { type: 'stopped'; taskId: string }
  | { type: 'agents'; list: AgentInfo[] }
  | { type: 'status'; taskId: string; status: AgentStatus }
  | { type: 'error'; taskId?: string; message: string };

interface AgentInfo {
  taskId: string;
  agent: string;
  pid: number;
  startedAt: number;
  cwd: string;
}

type AgentStatus = 'running' | 'completed' | 'failed' | 'stopped';
```

### Health Check

```
GET http://localhost:9999/health
→ { status: 'ok', agents: 2, uptime: 3600 }
```

---

## Agent Spawning

### Claude Code

```typescript
import { spawn } from 'node:child_process';

function startClaudeCode(opts: {
  taskId: string;
  prompt: string;
  cwd: string;
}): ChildProcess {
  const proc = spawn('claude', [
    '-p', opts.prompt,
    '--allowedTools', 'mcp__shipyard__*',
    '--dangerouslySkipPermissions',  // Optional: for unattended runs
  ], {
    cwd: opts.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHIPYARD_TASK_ID: opts.taskId,  // Agent can read this
    }
  });

  return proc;
}
```

### Codex (Future)

```typescript
function startCodex(opts: { taskId: string; prompt: string; cwd: string }): ChildProcess {
  return spawn('codex', ['exec', opts.prompt], {
    cwd: opts.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
```

---

## Lock File Management

Reuse the same pattern as registry-server.ts:

```typescript
const DAEMON_LOCK = join(process.env.HOME, '.shipyard', 'daemon.lock');

function writeLock(): void {
  mkdirSync(dirname(DAEMON_LOCK), { recursive: true });
  writeFileSync(DAEMON_LOCK, `${process.pid}\n${Date.now()}`);
}

function readLock(): { pid: number; startedAt: number } | null {
  try {
    const [pid, startedAt] = readFileSync(DAEMON_LOCK, 'utf-8').split('\n');
    return { pid: parseInt(pid), startedAt: parseInt(startedAt) };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

---

## MCP Integration

Add to `apps/server/src/index.ts`:

```typescript
import { ensureDaemonRunning } from './daemon-launcher.js';

// At startup, ensure daemon is running
await ensureDaemonRunning();
```

`daemon-launcher.ts`:

```typescript
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const DAEMON_PORTS = [56609, 49548]; // High random ports, unlikely to collide
const DAEMON_PATH = join(__dirname, '../../daemon/dist/index.js');

export async function ensureDaemonRunning(): Promise<void> {
  // Check if daemon is already running
  try {
    const res = await fetch(`http://localhost:${DAEMON_PORT}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      logger.info('Daemon already running');
      return;
    }
  } catch {
    // Not running, continue to spawn
  }

  // Spawn detached daemon
  logger.info('Spawning daemon...');
  const daemon = spawn('node', [DAEMON_PATH], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });
  daemon.unref();

  // Wait for daemon to be ready
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://localhost:${DAEMON_PORT}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        logger.info('Daemon started successfully');
        return;
      }
    } catch {
      // Keep waiting
    }
  }

  logger.warn('Daemon may not have started - browser agent launching may not work');
}
```

---

## Browser Integration

### React Hook

```typescript
// apps/web/src/hooks/useDaemon.ts
import { useCallback, useEffect, useRef, useState } from 'react';

interface DaemonState {
  connected: boolean;
  agents: AgentInfo[];
}

export function useDaemon() {
  const ws = useRef<WebSocket | null>(null);
  const [state, setState] = useState<DaemonState>({ connected: false, agents: [] });

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:9999');

    socket.onopen = () => {
      setState(s => ({ ...s, connected: true }));
      socket.send(JSON.stringify({ type: 'list-agents' }));
    };

    socket.onclose = () => {
      setState(s => ({ ...s, connected: false }));
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // Handle messages...
    };

    ws.current = socket;
    return () => socket.close();
  }, []);

  const startAgent = useCallback((agent: string, taskId: string, prompt: string) => {
    ws.current?.send(JSON.stringify({ type: 'start-agent', agent, taskId, prompt }));
  }, []);

  const stopAgent = useCallback((taskId: string) => {
    ws.current?.send(JSON.stringify({ type: 'stop-agent', taskId }));
  }, []);

  return { ...state, startAgent, stopAgent };
}
```

---

## UI Design

Based on research across Linear, Notion, GitHub Projects, Vercel, Slack, Figma, Devin, Replit, and Cursor.

### Recommendation: Sidebar Button + Command Palette (Hybrid)

**Why this pattern:**
- **Discoverable** for new users (visible button)
- **Efficient** for power users (Cmd+K)
- **Proven** across Linear, Notion, Figma, modern AI tools

### Expanded Sidebar

```
┌─────────────────────────────┐
│  ⛵ Shipyard                │
├─────────────────────────────┤
│                             │
│ ┌─────────────────────────┐ │
│ │  + Create Task          │ │  ← Accent color, bold
│ └─────────────────────────┘ │
│                             │
│ ─────────────────────────── │
│                             │
│ ○ Task #1: Auth flow        │
│ ○ Task #2: API design       │
│                             │
└─────────────────────────────┘
```

### Collapsed Sidebar

```
┌──┐
│⊕ │ ← Tooltip: "Create Task (⌘K)"
│📋│
│🔧│
│⚙ │
└──┘
```

### Button Copy

| Use Case | Label |
|----------|-------|
| Primary | **"+ Create Task"** |
| With agent | "+ New Agent Task" |
| On existing task | "▶ Start Agent" (context menu) |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command palette (primary) |
| `Cmd+N` | Quick create task (optional, later) |
| `C` | Create task (single-letter, power user mode) |

### Interaction Flow

```
Flow A: Create Task Manually
─────────────────────────────
User clicks "+ Create Task"
        ↓
Lightweight modal:
  ┌────────────────────────────┐
  │ Create Task                │
  ├────────────────────────────┤
  │ Title: [________________]  │  ← Auto-focused
  │                            │
  │ ○ Create manually          │
  │ ● Start agent to create    │  ← Optional
  │                            │
  │ [Cancel]        [Create]   │
  └────────────────────────────┘
        ↓
Task created, opens in editor


Flow B: Start Agent on Existing Task
────────────────────────────────────
User right-clicks task in list
        ↓
Context menu:
  ├─ ▶ Start Agent
  ├─ Edit
  └─ Archive
        ↓
User clicks "Start Agent"
        ↓
Agent selection dropdown:
  • Claude Code (recommended)
  • Codex
        ↓
Browser → Daemon → spawn agent
        ↓
Output panel shows progress
        ↓
User can: Watch, Stop, or Continue reviewing
```

### Visual Hierarchy

- **Button color:** Accent (not gray)
- **Button padding:** Slightly larger than list items (24px vs 16px)
- **Font weight:** Semi-bold (600)
- **Hover state:** Background color shift
- **Focus ring:** 2px accent color (accessibility)

### Comparison to Industry

| Tool | Primary Pattern | Location | Keyboard |
|------|-----------------|----------|----------|
| Linear | "Create issue" | Top sidebar | `C` |
| Notion | "+ New" | Sidebar | Context menu |
| Figma | "New file" | Top left | ⌘⇧N |
| Cursor | "Agent Chat" | Tab | ⌘⇧A |
| **Shipyard** | **"+ Create Task"** | **Top sidebar** | **⌘K** |

---

## Implementation Phases

### Phase 1: Daemon Core (MVP) ✅ COMPLETE

**Commit:** 30d913c
**Scope:**
- [x] Create `apps/daemon/` package
- [x] WebSocket server on ports 56609/49548 with fallback
- [x] Health check endpoint
- [x] Lock file management
- [x] Claude Code spawning only
- [x] Output streaming
- [x] Agent stop functionality

**Not in Phase 1:**
- Multiple agent types
- Worktree management
- Browser UI (test via CLI/Postman)

**Effort:** 2-3 days

### Phase 2: MCP Integration ✅ COMPLETE

**Commit:** f8c70cf
**Scope:**
- [x] Add `daemon-launcher.ts` to MCP server
- [x] Auto-spawn daemon on MCP startup
- [x] Health check before operations
- [x] Graceful fallback if daemon unavailable

**Effort:** 1 day

### Phase 3: Browser UI ✅ COMPLETE

**Commit:** 64fbc93
**Scope:**
- [x] `useDaemon` React hook
- [x] "+ Create Task" button in sidebar (collapsed + expanded)
- [x] Agent launcher modal with task input
- [x] Output viewer panel
- [x] Stop agent button
- [x] Connection status indicator

**Effort:** 2-3 days

### Phase 4: Polish 🚧 IN PROGRESS

**Scope:**
- [ ] NPX packaging as `shipyard` (unscoped)
- [ ] Documentation (SETUP.md, this file)
- [ ] Final cleanup
- [ ] Codex support (future)
- [ ] Worktree integration (future)
- [ ] ~~Keyboard shortcuts (Cmd+K)~~ - Deferred, no UI infrastructure

**Effort:** 2-3 days

---

## Open Questions

### Technical

1. **Port discovery:** ~~Fixed 9999 or configurable?~~ **RESOLVED**
   - Using random high ports: 56609 (primary), 49548 (fallback)
   - IANA dynamic range (49152-65535), unlikely to collide

2. **Multi-user:** What if multiple users on same machine?
   - Each user gets their own daemon (per-user lock file)

3. **Agent context:** How does spawned agent know about the task?
   - Pass via environment variable + prompt
   - Agent reads `SHIPYARD_TASK_ID`, calls `readTask()`

4. **Working directory:** Where does agent run?
   - Option A: cwd of daemon
   - Option B: Passed from browser (last known project)
   - Option C: User selects in modal

### UX

1. **Daemon not running:** What does browser show?
   - "Agent launcher not available. Run `npx @schoolai/shipyard-daemon` to enable."

2. **Agent already running on task:** Allow multiple? Replace?
   - Show warning, let user choose

3. **Output verbosity:** Full stream or summary?
   - Default: Summary with "Show details" toggle

---

## Security Considerations

1. **Localhost only:** Daemon only binds to 127.0.0.1
2. **No remote execution:** Cannot spawn agents on remote machines
3. **Process isolation:** Each agent runs in separate process with user's permissions
4. **No credential passing:** Agents use user's existing auth (gh CLI, etc.)

---

## Related Issues

- #140 - This issue (parent)
- #9 - IDE/Editor adapters (reverse direction)
- #60 - Claude Cowork integration
- #186 - Worktrees for debugging

---

## References

- VSCode URL scheme implementation
- Zoom launcher pattern
- Slack desktop deep links
- Node.js `spawn` with `detached: true`

---

*Last updated: 2026-01-27*
