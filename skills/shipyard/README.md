# Shipyard Skill for Claude Cowork

Proof-of-work tracking for AI agent tasks.

## Quick Start

### 1. Configure MCP Server

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": ["-y", "@shipyard/server"]
    }
  }
}
```

### 2. Install Skill

1. Download `shipyard.zip`
2. Claude Desktop → Settings → Skills → Upload
3. Enable the skill

### 3. Use It

Ask Claude to do verified work:

> "Create a task to add dark mode and show me screenshots when done"

Claude will:
1. Create a task with deliverables
2. Do the work
3. Upload proof (screenshots, test results)
4. Auto-complete when all deliverables have artifacts

## What's a Deliverable?

Something you can **prove** with an artifact:

- Screenshot of login page
- Video of feature working
- Test results file

## Links

- [Shipyard Docs](https://github.com/SchoolAI/shipyard)
- [SKILL.md](./SKILL.md) - Full instructions for Claude
