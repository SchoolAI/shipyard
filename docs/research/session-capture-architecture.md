# Session Capture Architecture

**Date:** 2026-01-13
**Purpose:** Visual reference for how session IDs are captured across different AI platforms

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Agent Platforms                          │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Claude   │  │  Cursor  │  │ Windsurf │  │  Devin   │    ...    │
│  │  Code    │  │ Composer │  │ Cascade  │  │          │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │             │             │             │                  │
└───────┼─────────────┼─────────────┼─────────────┼──────────────────┘
        │             │             │             │
        │ Hook        │ Hook        │ Hook        │ API/Manual
        │ System      │ System      │ System      │
        ▼             ▼             ▼             ▼
┌───────────────────────────────────────────────────────────────────┐
│                      Session Capture Layer                        │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ PreToolUse  │  │beforeMCP    │  │pre_mcp_tool │             │
│  │   Hook      │  │ Execution   │  │    _use     │    ...      │
│  │  (Claude)   │  │  (Cursor)   │  │ (Windsurf)  │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                    Extract Session                              │
│                       Metadata                                  │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Peer-Plan MCP Server                           │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ create_plan({ title, blocks, origin: { ... } })       │     │
│  │                                                        │     │
│  │ origin: {                                              │     │
│  │   platform: 'cursor' | 'claude-code' | 'windsurf' ... │     │
│  │   session_id: 'ses_xxx' | conversation_id: 'conv_xx'  │     │
│  │   timestamp: 1234567890                                │     │
│  │   transcript_path?: '/path/to/session.json'            │     │
│  │ }                                                      │     │
│  └────────────────────────────────────────────────────────┘     │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│                   Y.Doc (CRDT Storage)                            │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ Plan Metadata:                                         │     │
│  │   - title: "Feature X"                                 │     │
│  │   - created: 2026-01-13                                │     │
│  │   - origin:                                            │     │
│  │       platform: "cursor"                               │     │
│  │       conversation_id: "conv_stable_123"               │     │
│  │       generation_id: "gen_456"                         │     │
│  │       timestamp: 1736732400000                         │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                           │
                           │ Later: Export Transcript
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│                   Conversation Export                             │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ export_session({                                       │     │
│  │   platform: 'cursor',                                  │     │
│  │   session_id: 'conv_stable_123',                       │     │
│  │   output_path: '/tmp/conversation.json'                │     │
│  │ })                                                     │     │
│  └────────────────────────────────────────────────────────┘     │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│              Platform-Specific Export Adapters                    │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Cursor   │  │  Claude  │  │  Devin   │  │ GitHub   │         │
│  │ API      │  │   File   │  │   API    │  │ Copilot  │         │
│  │ Client   │  │  Reader  │  │  Client  │  │   CLI    │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       │             │             │             │                │
└───────┼─────────────┼─────────────┼─────────────┼────────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
   External API   File System   External API   CLI Tool
```

---

## Platform-Specific Flows

### Flow 1: Claude Code (Current Implementation)

```
┌──────────────┐
│  User sends  │
│    prompt    │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  Claude Code     │
│  Agent Engine    │
└──────┬───────────┘
       │
       │ Prepare to call MCP tool
       ▼
┌────────────────────────────────────────┐
│  PreToolUse Hook Fires                 │
│                                        │
│  Input (stdin):                        │
│  {                                     │
│    "session_id": "ses_abc123",         │
│    "transcript_path": "/path/to.json", │
│    "tool_name": "create_plan",         │
│    "tool_args": { ... }                │
│  }                                     │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Hook Script (.claude/hooks/)          │
│                                        │
│  1. Parse JSON from stdin              │
│  2. Extract session_id & transcript    │
│  3. Inject into tool_args.origin       │
│  4. Return modified args               │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  MCP Server receives:                  │
│                                        │
│  create_plan({                         │
│    title: "...",                       │
│    blocks: [...],                      │
│    origin: {                           │
│      platform: "claude-code",          │
│      session_id: "ses_abc123",         │
│      transcript_path: "/path/to.json"  │
│    }                                   │
│  })                                    │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Store in Y.Doc                        │
│  Plan metadata includes origin         │
└────────────────────────────────────────┘
       │
       │ Later...
       ▼
┌────────────────────────────────────────┐
│  Export Transcript:                    │
│  - Read transcript_path directly       │
│  - Full conversation available         │
└────────────────────────────────────────┘
```

### Flow 2: Cursor Composer (To Implement)

```
┌──────────────┐
│  User sends  │
│    prompt    │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  Cursor Composer │
│  Agent Engine    │
└──────┬───────────┘
       │
       │ Prepare to call MCP tool
       ▼
┌────────────────────────────────────────┐
│  beforeMCPExecution Hook Fires         │
│                                        │
│  Input (stdin):                        │
│  {                                     │
│    "conversation_id": "conv_123",      │
│    "generation_id": "gen_456",         │
│    "model": "claude-sonnet-4",         │
│    "tool_name": "create_plan",         │
│    "tool_args": { ... },               │
│    "user_email": "user@example.com"    │
│  }                                     │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Hook Script (.cursor/hooks/)          │
│                                        │
│  1. Parse JSON from stdin              │
│  2. Extract conversation_id            │
│  3. Extract generation_id              │
│  4. Inject into tool_args.origin       │
│  5. Return { action: "allow", ... }    │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  MCP Server receives:                  │
│                                        │
│  create_plan({                         │
│    title: "...",                       │
│    blocks: [...],                      │
│    origin: {                           │
│      platform: "cursor",               │
│      conversation_id: "conv_123",      │
│      generation_id: "gen_456"          │
│    }                                   │
│  })                                    │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Store in Y.Doc                        │
│  Plan metadata includes origin         │
└────────────────────────────────────────┘
       │
       │ Later...
       ▼
┌────────────────────────────────────────┐
│  Export Transcript:                    │
│                                        │
│  1. Read conversation_id from plan     │
│  2. Authenticate with Cursor API       │
│  3. GET /v0/agents/{conv_id}/conv      │
│  4. Parse JSON response                │
│  5. Save transcript                    │
└────────────────────────────────────────┘
```

### Flow 3: Devin (No Hooks - Manual)

```
┌──────────────┐
│  User sends  │
│    prompt    │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  Devin Agent     │
│  Engine          │
└──────┬───────────┘
       │
       │ No hook system!
       ▼
┌────────────────────────────────────────┐
│  Devin calls MCP tool directly         │
│                                        │
│  User must manually provide:           │
│                                        │
│  create_plan({                         │
│    title: "...",                       │
│    blocks: [...],                      │
│    origin: {                           │
│      platform: "devin",                │
│      session_id: "devin_ses_789"  ⬅️   │
│      // ^^^ USER PROVIDES THIS         │
│    }                                   │
│  })                                    │
└──────┬─────────────────────────────────┘
       │
       │ How does user get session_id?
       ▼
┌────────────────────────────────────────┐
│  Option A: Devin UI                    │
│  - Copy session ID from Devin UI       │
│  - Paste into create_plan call         │
│                                        │
│  Option B: Devin Prompt                │
│  - User asks: "What's my session ID?"  │
│  - Devin might know (internal state)   │
│                                        │
│  Option C: API Key Correlation         │
│  - Track DEVIN_API_KEY usage           │
│  - Query API for recent sessions       │
│  - Match by timestamp (imprecise)      │
└────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Store in Y.Doc                        │
│  Plan metadata includes origin         │
└────────────────────────────────────────┘
       │
       │ Later...
       ▼
┌────────────────────────────────────────┐
│  Export Transcript:                    │
│                                        │
│  1. Read session_id from plan          │
│  2. Authenticate with Devin API        │
│  3. GET /v1/sessions/{session_id}      │
│  4. Parse message history              │
│  5. Save transcript                    │
└────────────────────────────────────────┘
```

---

## Hook Installation Flows

### User Perspective: Installing Cursor Hook

```
┌─────────────────────────────────────────────────────────┐
│  Step 1: Download Hook Files                            │
│                                                         │
│  $ curl -o .cursor/hooks/peer-plan-origin.js \          │
│    https://raw.githubusercontent.com/.../hooks/cursor/  │
│                                                         │
│  $ chmod +x .cursor/hooks/peer-plan-origin.js           │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Step 2: Configure Hooks                                │
│                                                         │
│  Create .cursor/hooks.json:                             │
│  {                                                      │
│    "version": 1,                                        │
│    "hooks": {                                           │
│      "beforeMCPExecution": [{                           │
│        "command": "node .cursor/hooks/peer-plan-...js", │
│        "async": false                                   │
│      }]                                                 │
│    }                                                    │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Step 3: Test Hook                                      │
│                                                         │
│  1. Open Cursor Composer                                │
│  2. Try calling create_plan                             │
│  3. Verify origin metadata is captured                  │
│  4. Check plan in Peer-Plan UI                          │
└─────────────────────────────────────────────────────────┘
```

### Enterprise: Distributing Hooks at Scale

```
┌─────────────────────────────────────────────────────────┐
│  Cursor Enterprise Admin Dashboard                      │
│                                                         │
│  1. Navigate to "Hooks" section                         │
│  2. Click "Add New Hook"                                │
│  3. Upload peer-plan-origin.js                          │
│  4. Configure:                                          │
│     - Hook event: beforeMCPExecution                    │
│     - OS: All (or specific)                             │
│     - Teams: All developers                             │
│  5. Save and Publish                                    │
└─────────────────────────────────────────────────────────┘
                        │
                        │ Automatic Distribution
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Developer Workstations                                 │
│                                                         │
│  - Hooks auto-downloaded on next Cursor launch          │
│  - Applied to all workspaces automatically              │
│  - No manual installation required                      │
│  - IT control over updates and versions                 │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow: Session Metadata

### What Gets Captured

```
┌─────────────────────────────────────────────────────────────┐
│                    Session Metadata                         │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │ Required (All Platforms):                       │       │
│  │  - platform: string                             │       │
│  │  - timestamp: number                            │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │ Platform-Specific Identifiers:                  │       │
│  │                                                 │       │
│  │ Claude Code:                                    │       │
│  │  - session_id: string                           │       │
│  │  - transcript_path: string                      │       │
│  │                                                 │       │
│  │ Cursor:                                         │       │
│  │  - conversation_id: string (stable)             │       │
│  │  - generation_id: string (per-prompt)           │       │
│  │                                                 │       │
│  │ Windsurf:                                       │       │
│  │  - (TBD after testing)                          │       │
│  │                                                 │       │
│  │ Devin:                                          │       │
│  │  - session_id: string (manual)                  │       │
│  │  - api_key_hash?: string (optional)             │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │ Optional Enrichment:                            │       │
│  │  - user_email?: string                          │       │
│  │  - workspace_path?: string                      │       │
│  │  - model?: string                               │       │
│  │  - notes?: string                               │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Storage in Y.Doc

```
Y.Map<"plans"> {
  "plan-abc-123": Y.Map {
    "id": "plan-abc-123",
    "title": "Implement feature X",
    "created": 1736732400000,
    "updated": 1736732400000,
    "blocks": Y.Array<Block>([...]),

    "origin": Y.Map {              ⬅️ Session metadata here
      "platform": "cursor",
      "conversation_id": "conv_stable_123",
      "generation_id": "gen_456",
      "timestamp": 1736732400000,
      "user_email": "dev@company.com",
      "model": "claude-sonnet-4"
    }
  }
}
```

---

## Export Architecture

### Export Tool Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. User requests transcript export                     │
│                                                         │
│  export_session({                                       │
│    plan_id: "plan-abc-123"                              │
│  })                                                     │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  2. Load plan metadata from Y.Doc                       │
│                                                         │
│  origin = {                                             │
│    platform: "cursor",                                  │
│    conversation_id: "conv_123",                         │
│    generation_id: "gen_456"                             │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  3. Route to platform-specific exporter                 │
│                                                         │
│  switch (origin.platform) {                             │
│    case 'cursor':                                       │
│      return exportCursorSession(...)                    │
│    case 'claude-code':                                  │
│      return exportClaudeCodeSession(...)                │
│    case 'devin':                                        │
│      return exportDevinSession(...)                     │
│    ...                                                  │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  4. Platform Exporter Implementation                    │
│                                                         │
│  async function exportCursorSession(origin) {           │
│    const apiKey = getStoredApiKey('cursor');            │
│    const response = await fetch(                        │
│      `https://api.cursor.com/v0/agents/                 │
│       ${origin.conversation_id}/conversation`,          │
│      { headers: { Authorization: `Bearer ${apiKey}` }}  │
│    );                                                   │
│    return response.json();                              │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  5. Format and save transcript                          │
│                                                         │
│  {                                                      │
│    "plan_id": "plan-abc-123",                           │
│    "platform": "cursor",                                │
│    "exported_at": 1736732400000,                        │
│    "conversation": {                                    │
│      "id": "conv_123",                                  │
│      "messages": [ ... ],                               │
│      "metadata": { ... }                                │
│    }                                                    │
│  }                                                      │
│                                                         │
│  Save to: /exports/plan-abc-123-conversation.json       │
└─────────────────────────────────────────────────────────┘
```

---

## Security & Privacy

### API Key Management

```
┌─────────────────────────────────────────────────────────┐
│  API Key Storage Options                                │
│                                                         │
│  1. Environment Variables (Simplest)                    │
│     - CURSOR_API_KEY=xxx                                │
│     - DEVIN_API_KEY=yyy                                 │
│     - Read from process.env                             │
│                                                         │
│  2. Secure Config File (Better)                         │
│     - Store in ~/.peer-plan/config.json                 │
│     - Encrypt with user's system keychain               │
│     - Use node-keytar or similar                        │
│                                                         │
│  3. Per-Request (Most Secure)                           │
│     - Prompt user for API key on each export            │
│     - Never store                                       │
│     - Inconvenient but safest                           │
└─────────────────────────────────────────────────────────┘
```

### Data Retention

```
┌─────────────────────────────────────────────────────────┐
│  What We Store Permanently:                             │
│   ✅ Session IDs (just identifiers)                     │
│   ✅ Platform names                                     │
│   ✅ Timestamps                                         │
│   ✅ Plan metadata                                      │
│                                                         │
│  What We Store Temporarily:                             │
│   ⚠️ API keys (if user opts in)                         │
│   ⚠️ Exported transcripts (cache for 30 days)           │
│                                                         │
│  What We Never Store:                                   │
│   ❌ Full transcripts in Y.Doc                          │
│   ❌ Unencrypted API keys                               │
│   ❌ User credentials                                   │
└─────────────────────────────────────────────────────────┘
```

---

## Testing Strategy

### Component Tests

```
┌─────────────────────────────────────────────────────────┐
│  Hook Scripts                                           │
│   - Test JSON parsing                                   │
│   - Test origin metadata injection                      │
│   - Test error handling                                 │
│                                                         │
│  Platform Exporters                                     │
│   - Mock API responses                                  │
│   - Test authentication                                 │
│   - Test error cases (network, auth)                    │
│                                                         │
│  Storage Layer                                          │
│   - Test origin metadata storage in Y.Doc               │
│   - Test retrieval                                      │
│   - Test migration (if schema changes)                  │
└─────────────────────────────────────────────────────────┘
```

### Integration Tests

```
┌─────────────────────────────────────────────────────────┐
│  End-to-End Flows                                       │
│                                                         │
│  1. Hook → MCP → Storage                                │
│     - Simulate hook execution                           │
│     - Verify metadata stored correctly                  │
│                                                         │
│  2. Storage → Export → Transcript                       │
│     - Load plan with origin metadata                    │
│     - Export transcript                                 │
│     - Verify format and completeness                    │
│                                                         │
│  3. Cross-Platform                                      │
│     - Same plan created from multiple sessions          │
│     - Verify all origins tracked                        │
└─────────────────────────────────────────────────────────┘
```

---

## Future Enhancements

### Multi-Session Plans

```
┌─────────────────────────────────────────────────────────┐
│  Scenario: Plan modified across platforms               │
│                                                         │
│  Plan created in Cursor:                                │
│    origin: { platform: "cursor", conversation_id: 1 }   │
│                                                         │
│  Updated in Claude Code:                                │
│    origin: { platform: "cursor", conversation_id: 1 }   │
│    history: [                                           │
│      { platform: "claude-code", session_id: 2,          │
│        action: "updated", timestamp: ... }              │
│    ]                                                    │
│                                                         │
│  Allows tracking full evolution of plan                 │
└─────────────────────────────────────────────────────────┘
```

### MCP Protocol Extension

```
┌─────────────────────────────────────────────────────────┐
│  Proposal: Standardize session metadata passing         │
│                                                         │
│  MCP Request Headers (Extension):                       │
│    X-Agent-Platform: cursor                             │
│    X-Agent-Session-Id: conv_123                         │
│    X-Agent-User: user@example.com                       │
│                                                         │
│  Benefits:                                              │
│   - No hooks needed                                     │
│   - Standardized across platforms                       │
│   - Automatic metadata passing                          │
│                                                         │
│  Challenges:                                            │
│   - Requires MCP spec changes                           │
│   - Platform adoption needed                            │
│   - Backwards compatibility                             │
└─────────────────────────────────────────────────────────┘
```

---

**Last Updated:** 2026-01-13
