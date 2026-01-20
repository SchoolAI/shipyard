# Milestone 1: Agent Creates Plans

**Status**: ✅ Complete
**Goal**: MCP server that lets Claude create plans and launch browser

---

## Overview

Build a minimal MCP server that:
1. Accepts `create_plan` tool calls from Claude
2. Generates a URL-encoded plan
3. Launches browser with the plan URL

No GitHub, no sync, no persistence yet. Just plan creation → browser launch.

---

## Deliverables

### 1a: MCP Server Scaffold

- [ ] Create `packages/server/` with TypeScript
- [ ] Install `@modelcontextprotocol/sdk`
- [ ] Set up stdio transport
- [ ] Configure for Claude Code integration

### 1b: `create_plan` Tool

- [ ] Define tool schema with Zod
- [ ] Accept: title, content (BlockNote blocks), prNumber, repo
- [ ] Generate plan ID (hash or UUID)
- [ ] Create Y.Doc with plan data
- [ ] Encode plan to URL using `@shipyard/schema`
- [ ] Return plan URL

```typescript
// Tool definition
server.tool(
  "create_plan",
  {
    title: z.string().describe("Plan title"),
    repo: z.string().optional().describe("GitHub repo (org/repo)"),
    prNumber: z.number().optional().describe("PR number"),
    content: z.string().describe("Plan content (markdown or BlockNote JSON)"),
  },
  async (args) => {
    // Create Y.Doc with plan
    const ydoc = new Y.Doc();
    const planId = generatePlanId();

    // Set metadata
    initPlanMetadata(ydoc, {
      id: planId,
      title: args.title,
      status: 'draft',
      repo: args.repo,
      pr: args.prNumber,
    });

    // Encode to URL
    const url = createPlanUrl(baseUrl, {
      v: 1,
      id: planId,
      title: args.title,
      status: 'draft',
      content: parseContentToBlocks(args.content),
    });

    return { planId, url };
  }
);
```

### 1c: Browser Launch

- [ ] Use `open` package (cross-platform browser launch)
- [ ] Launch browser with plan URL
- [ ] Option: `open_plan` tool to open existing URL

### 1d: Basic Web App (Placeholder)

- [ ] Create `packages/web/` with Vite + React
- [ ] Parse `?d=` query param
- [ ] Decode plan using `@shipyard/schema`
- [ ] Render as JSON or simple markdown
- [ ] Deploy to localhost for testing

---

## Demo Checkpoint

**Scenario**: User asks Claude to create an implementation plan

```
User: "Create an implementation plan for adding user authentication"

Claude: [calls create_plan tool]

Result:
- Browser opens with URL like `http://localhost:5173/plan?d=...`
- Page shows the plan structure (even if just JSON)
```

---

## Success Criteria

1. Claude can call `create_plan` tool
2. Browser launches with encoded plan URL
3. Web app decodes and displays the plan
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

async function launchPlan(url: string) {
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
