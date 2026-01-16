// TODO: Convert to a runbook

# @peer-plan/hook

Claude Code integration hook for peer-plan. Automatically creates and syncs plans when agents enter plan mode.

## How It Works

This hook intercepts Claude Code events and bridges them to the peer-plan system:

1. **EnterPlanMode** → Creates plan, opens browser, sets "Claude is here" presence
2. **Write/Edit** (in plan mode) → Syncs content in real-time
3. **ExitPlanMode** → Blocks until human reviews and approves

## Installation

### Prerequisites

- Node.js 22+ (LTS)
- peer-plan MCP server running (`@peer-plan/server`)

### Option 1: npm Global Install (Recommended for Users)

```bash
npm install -g @peer-plan/hook
```

The postinstall script automatically configures Claude Code hooks in `~/.claude/settings.json`. Just restart Claude Code after installation.

If the automatic setup didn't work, you can manually run:
```bash
peer-plan-hook-install
```

### Option 2: Plugin Directory (Testing/Development)

```bash
# Build the hook first
cd /path/to/peer-plan
pnpm build

# Run Claude Code with explicit plugin directory
claude --plugin-dir ./apps/hook
```

This loads the plugin without global installation - useful for testing.

### Option 3: Local Development

For active development on peer-plan itself:

```bash
cd /path/to/peer-plan

# One-time: Create global symlink
pnpm --filter @peer-plan/hook dev:link

# Run in watch mode (rebuilds on changes)
pnpm --filter @peer-plan/hook dev

# The hooks.json expects "peer-plan-hook" in PATH
# pnpm link --global creates this symlink automatically
```

### Option 4: Manual Configuration

If you prefer manual setup, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [{ "type": "command", "command": "peer-plan-hook", "timeout": 1800 }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [{ "type": "command", "command": "peer-plan-hook" }]
      }
    ],
    "SessionStart": [
      {
        "hooks": [{ "type": "command", "command": "peer-plan-hook --context" }]
      }
    ]
  }
}
```

## Configuration (Automatic)

The install script adds this to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "peer-plan-hook"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "peer-plan-hook",
            "timeout": 1800
          }
        ]
      }
    ]
  }
}
```

**Note:** The `matcher: "*"` matches ALL tools, but the hook only acts on plan mode events (checked internally). This ensures Write/Edit trigger the hook while avoiding unnecessary overhead in non-plan modes.

## Local Testing

### 1. Start the peer-plan stack

```bash
cd /path/to/peer-plan

# Terminal 1: Start MCP server (includes registry + WebSocket)
pnpm dev:server

# Terminal 2: Start web UI
pnpm dev:web
```

### 2. Build the hook

```bash
pnpm --filter @peer-plan/hook build
```

### 3. Run the test harness

```bash
cd apps/hook/test
./test-harness.sh
```

This simulates the full hook lifecycle:
- Creates a plan (simulates EnterPlanMode)
- Updates content (simulates Write)
- Edits content (simulates Edit)
- Tries to exit (simulates ExitPlanMode - should block)
- Tests passthrough (non-plan mode)

### 4. Manual Testing with Real Claude Code

1. Configure the hook in your Claude Code settings (see Configuration above)
2. Restart Claude Code: `/quit` then relaunch
3. Enter plan mode: Press Shift+Tab or use `/mode plan`
4. Type something to trigger EnterPlanMode
5. Check that a browser tab opens with your plan
6. Write to the plan file - content should sync in real-time
7. Try to exit plan mode - should block until you approve in browser

### 5. Debug Logging

Enable debug logs to see hook execution:

```bash
export LOG_LEVEL=debug
```

The hook logs to stderr, so you can see them in Claude Code's debug output.

## State Management

The hook maintains session state at:
```
~/.peer-plan/hook-state.json
```

This file maps session IDs to plan IDs. It's automatically cleaned up after 24 hours.

## Architecture

```
Claude Code → Hook CLI → HTTP API → Registry Server → Y.Doc
                ↓
            State File
        (~/.peer-plan/hook-state.json)
```

### Adapter Pattern

The hook uses an adapter pattern to support multiple agent systems:

- **Abstract Layer** (`src/adapters/types.ts`) - `AgentAdapter` interface
- **Claude Code Adapter** (`src/adapters/claude-code.ts`) - Implements Claude Code hook protocol
- **Future**: Open Agents adapter, custom agents, etc.

## Development

### Build

```bash
pnpm build
```

### Watch Mode

```bash
pnpm dev
```

### Type Check

```bash
pnpm typecheck
```

### Lint

```bash
pnpm lint
pnpm lint:fix
```

## Troubleshooting

### Hook not executing

1. Check Claude Code settings are correct
2. Restart Claude Code after changing settings
3. Check hook binary exists: `which peer-plan-hook`
4. Check hook binary is executable: `ls -l $(which peer-plan-hook)`

### Plan not appearing

1. Ensure registry server is running: `curl http://localhost:32191/registry`
2. Check browser console for errors
3. Check server logs: `LOG_LEVEL=debug pnpm dev:server`

### Changes not syncing

1. Check WebSocket connection in browser dev tools
2. Verify plan ID matches between hook state and browser URL
3. Check `~/.peer-plan/hook-state.json` for session mapping

### Review not blocking exit

1. Check plan status in browser (should be "pending_review" or "changes_requested")
2. Manually trigger status update in UI
3. Check server logs for review status endpoint responses

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REGISTRY_PORT` | `32191,32192` | Registry server port |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `PEER_PLAN_STATE_DIR` | `~/.peer-plan` | State directory |

## License

MIT
