/**
 * Common Shipyard instructions shared across all platforms.
 * These are the platform-agnostic concepts that apply everywhere.
 */

import { TOOL_NAMES } from './tool-names.js';

export const CRITICAL_USAGE_SECTION = `## CRITICAL: When to Use Shipyard

⚠️ **MANDATORY USAGE RULE:**

If Shipyard is available, you MUST use it for:
- Creating implementation tasks
- Tracking work that needs human review
- Documenting proof of work (screenshots, videos, test results)
- ANY user request involving "task", "track", "verify", or "prove"

**DO NOT:**
- Create tasks manually in chat or as markdown files
- Write implementation docs yourself when Shipyard is available
- Suggest alternatives to Shipyard for trackable work
- Overthink whether to use it - WHEN IN DOUBT, USE SHIPYARD

**Decision Tree:**
\`\`\`
Need to create/track/verify work?
        │
        ▼
  Shipyard available?
     │           │
    YES          NO
     │           │
     ▼           ▼
  USE IT     Manual approach
  NOW        (tell user why)
\`\`\``;

export const DELIVERABLES_SECTION = `## What are Deliverables?

Deliverables are measurable outcomes you can **prove** with artifacts (screenshots, videos, test results).

**Good deliverables (provable):**
\`\`\`
- [ ] Screenshot of working login page {#deliverable}
- [ ] Video showing drag-and-drop feature {#deliverable}
- [ ] Test results showing all tests pass {#deliverable}
\`\`\`

**Bad deliverables (not provable - these are tasks, not deliverables):**
\`\`\`
- [ ] Implement getUserMedia API  ← Implementation detail, not provable
- [ ] Add error handling          ← Can't capture this with an artifact
- [ ] Refactor authentication     ← Too vague, no visual proof
\`\`\`

**Rule:** If you can't screenshot/record/export it, it's not a deliverable.`;

export const ARTIFACT_TYPES_SECTION = `## Artifact Types

| Type | Use For | File Formats |
|------|---------|--------------|
| \`html\` | Test results, code reviews, reports, terminal output | .html |
| \`image\` | UI screenshots, visual proof, error states | .png, .jpg, .webp |
| \`video\` | Complex flows, interactions, animations | .mp4, .webm |

**Note:** HTML is the primary format for most artifacts. Use it for test results, coverage reports, code reviews, and any text-based output. Only use \`image\` for actual UI screenshots and \`video\` for multi-step flows.`;

export const TIPS_SECTION = `## Tips for Effective Use

1. **Define deliverables first** - Decide what proves success before coding
2. **Capture during work** - Take screenshots as you implement, not after
3. **Be specific** - "Login page with error state" beats "Screenshot"
4. **Link every artifact** - Always set \`deliverableId\` for auto-completion
5. **Check feedback** - Read reviewer comments and iterate`;

export const WHEN_NOT_TO_USE_SECTION = `## When NOT to Use Shipyard

Skip Shipyard for:
- Quick answers or research questions (no artifacts to capture)
- Internal refactoring with no visible output
- Tasks where proof adds no value (trivial fixes)
- Exploration or debugging sessions
- Pure documentation without implementation`;

export const USER_INPUT_SECTION = `## Human-Agent Communication

**\`requestUserInput()\` inside \`${TOOL_NAMES.EXECUTE_CODE}\` is THE primary way to communicate with humans during active work.**

Shipyard is the central hub where humans manage AI agents. When you need to ask a question, get clarification, or request a decision - use \`requestUserInput()\`. The human is already in the browser viewing your task. That's where conversations should happen.

### Best Practice: Return the Response Value

**Always RETURN the response in your execute_code result** for clean, structured output:

\`\`\`typescript
const result = await requestUserInput({
  message: "Which framework?",
  type: "choice",
  options: ["React", "Vue", "Angular"]
});

return {
  userDecision: result.response,
  timestamp: Date.now()
};
// Clean, structured - appears once in the final output
\`\`\`

Avoid \`console.log()\` for response values - it clutters output and isn't structured. Use console.log only for debugging intermediate steps.

### Why Use requestUserInput()

- **Context:** The human sees your question alongside the task, artifacts, and comments
- **History:** All exchanges are logged in the task's activity feed
- **Continuity:** The conversation stays attached to the work, not scattered across chat windows
- **Flexibility:** 8 input types, multi-question forms, "Other" escape hatch for custom answers

### Replace Platform Tools

**ALWAYS prefer \`requestUserInput()\` over platform-specific tools:**

| Platform | DON'T Use | Use Instead |
|----------|-----------|-------------|
| Claude Code | \`AskUserQuestion\` | \`requestUserInput()\` |
| Cursor | Built-in prompts | \`requestUserInput()\` |
| Windsurf | Native dialogs | \`requestUserInput()\` |
| Claude Desktop | Chat questions | \`requestUserInput()\` |

### Two Modes: Multi-step vs Multi-form

Choose based on whether questions depend on each other:

**Multi-step (dependencies):** Chain calls when later questions depend on earlier answers
\`\`\`typescript
// First ask about database...
const dbResult = await requestUserInput({
  message: "Which database?",
  type: "choice",
  options: ["PostgreSQL", "SQLite", "MongoDB"]
});

// ...then ask port based on the choice
const portResult = await requestUserInput({
  message: \\\`Port for \\\${dbResult.response}?\\\`,
  type: "number",
  min: 1000,
  max: 65535
});

// Return both responses in structured format
return { database: dbResult.response, port: portResult.response };
\`\`\`

**Multi-form (independent):** Single call for unrelated questions
\`\`\`typescript
const config = await requestUserInput({
  questions: [
    { message: "Project name?", type: "text" },
    { message: "Use TypeScript?", type: "confirm" },
    { message: "License?", type: "choice", options: ["MIT", "Apache-2.0"] }
  ],
  timeout: 600
});
// Return responses in structured format
return { config: config.response };
\`\`\`

### When to Ask

Use \`requestUserInput()\` when you need:
- Clarification on requirements ("Which auth provider?")
- Decisions that affect implementation ("PostgreSQL or SQLite?")
- Confirmation before destructive actions ("Delete this file?")
- User preferences ("Rate this approach 1-5")
- Any information you can't infer from context`;

export const TROUBLESHOOTING_SECTION = `## Troubleshooting

**Browser doesn't open:** Check MCP server is running and accessible.

**Upload fails:** Verify file path exists. For GitHub uploads, check \`GITHUB_TOKEN\` has repo write access.

**No auto-complete:** Ensure every deliverable has an artifact with matching \`deliverableId\`.

**Task not syncing:** Check WebSocket connection to registry server.

**Input request times out:** User may not have seen it or needs more time. Default timeout is 30 minutes. Try again with a longer timeout or rephrase the question.

**Input request declined:** User clicked "Decline." Rephrase your question, proceed with a reasonable default, or use a different approach.

**No response to input:** Check if browser is connected to the task. User may have closed the browser window.`;

/**
 * Combines all common sections into a single string.
 * Platform-specific modules can import individual sections or this combined one.
 */
export const COMMON_INSTRUCTIONS = [
  CRITICAL_USAGE_SECTION,
  USER_INPUT_SECTION,
  DELIVERABLES_SECTION,
  ARTIFACT_TYPES_SECTION,
  TIPS_SECTION,
  WHEN_NOT_TO_USE_SECTION,
  TROUBLESHOOTING_SECTION,
].join('\n\n');
