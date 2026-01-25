# Milestone 1: Agent Creates Tasks

**Status**: ✅ Complete
**Goal**: MCP server that lets Claude create tasks and launch browser

---

## Overview

Build a minimal MCP server that:
1. Accepts `create_task` tool calls from Claude
2. Generates a URL-encoded task
3. Launches browser with the task URL

No GitHub, no sync, no persistence yet. Just task creation → browser launch.

---

## Deliverables

### 1a: MCP Server Scaffold

- [ ] Create `packages/server/` with TypeScript
- [ ] Install `@modelcontextprotocol/sdk`
- [ ] Set up stdio transport
- [ ] Configure for Claude Code integration

### 1b: `create_task` Tool

- [ ] Define tool schema with Zod
- [ ] Accept: title, content (BlockNote blocks), prNumber, repo
- [ ] Generate task ID (hash or UUID)
- [ ] Create Y.Doc with task data
- [ ] Encode task to URL using `@shipyard/schema`
- [ ] Return task URL

```typescript
// Tool definition
server.tool(
  "create_task",
  {
    title: z.string().describe("Task title"),
    repo: z.string().optional().describe("GitHub repo (org/repo)"),
    prNumber: z.number().optional().describe("PR number"),
    content: z.string().describe("Task content (markdown or BlockNote JSON)"),
  },
  async (args) => {
    // Create Y.Doc with task
    const ydoc = new Y.Doc();
    const taskId = generateTaskId();

    // Set metadata
    initPlanMetadata(ydoc, {
      id: taskId,
      title: args.title,
      status: 'draft',
      repo: args.repo,
      pr: args.prNumber,
    });

    // Encode to URL
    const url = createPlanUrl(baseUrl, {
      v: 1,
      id: taskId,
      title: args.title,
      status: 'draft',
      content: parseContentToBlocks(args.content),
    });

    return { taskId, url };
  }
);
```

### 1c: Browser Launch

- [ ] Use `open` package (cross-platform browser launch)
- [ ] Launch browser with task URL
- [ ] Option: `open_task` tool to open existing URL

### 1d: Basic Web App (Placeholder)

- [ ] Create `packages/web/` with Vite + React
- [ ] Parse `?d=` query param
- [ ] Decode task using `@shipyard/schema`
- [ ] Render as JSON or simple markdown
- [ ] Deploy to localhost for testing

---

## Demo Checkpoint

**Scenario**: User asks Claude to create an implementation task

```
User: "Create an implementation task for adding user authentication"

Claude: [calls create_task tool]

Result:
- Browser opens with URL like `http://localhost:5173/?d=...`
- Page shows the task structure (even if just JSON)
```

---

## Success Criteria

1. Claude can call `create_task` tool
2. Browser launches with encoded task URL
3. Web app decodes and displays the task
4. Round-trip works: create → encode → URL → decode → display

---

## Technical Notes

### MCP Server Pattern

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  { name: "shipyard", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Register tools...

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Browser Launch

```typescript
import open from 'open';

async function launchTask(url: string) {
  await open(url);
}
```

---

## Dependencies

- Milestone 0 (schemas, URL encoding)

## Blocks

- Milestone 3 (Live Sync) - needs MCP server running

---

*Created: 2026-01-02*
