/**
 * Common Shipyard instructions shared across all platforms.
 * These are the platform-agnostic concepts that apply everywhere.
 */

export const CRITICAL_USAGE_SECTION = `## CRITICAL: When to Use Shipyard

⚠️ **MANDATORY USAGE RULE:**

If Shipyard is available, you MUST use it for:
- Creating implementation plans
- Tracking work that needs human review
- Documenting proof of work (screenshots, videos, test results)
- ANY user request involving "plan", "track", "verify", or "prove"

**DO NOT:**
- Create plans manually in chat or as markdown files
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
| \`screenshot\` | UI changes, visual proof, error states | .png, .jpg, .webp |
| \`video\` | Complex flows, interactions, animations | .mp4, .webm |
| \`test_results\` | Test output, coverage reports | .json, .txt, .xml |
| \`diff\` | Code changes, before/after comparisons | .diff, .patch |`;

export const TIPS_SECTION = `## Tips for Effective Use

1. **Plan deliverables first** - Decide what proves success before coding
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

export const TROUBLESHOOTING_SECTION = `## Troubleshooting

**Browser doesn't open:** Check MCP server is running and accessible.

**Upload fails:** Verify file path exists. For GitHub uploads, check \`GITHUB_TOKEN\` has repo write access.

**No auto-complete:** Ensure every deliverable has an artifact with matching \`deliverableId\`.

**Plan not syncing:** Check WebSocket connection to registry server.`;

/**
 * Combines all common sections into a single string.
 * Platform-specific modules can import individual sections or this combined one.
 */
export const COMMON_INSTRUCTIONS = [
  CRITICAL_USAGE_SECTION,
  DELIVERABLES_SECTION,
  ARTIFACT_TYPES_SECTION,
  TIPS_SECTION,
  WHEN_NOT_TO_USE_SECTION,
  TROUBLESHOOTING_SECTION,
].join('\n\n');
