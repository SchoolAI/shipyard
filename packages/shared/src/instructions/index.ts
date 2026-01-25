/**
 * Shipyard instructions module.
 *
 * Provides platform-specific instructions that stay in sync:
 * - Claude Code (hooks): Uses CLAUDE_CODE_INSTRUCTIONS via SessionStart hook
 * - Other platforms (MCP-only): Uses MCP_DIRECT_INSTRUCTIONS via SKILL.md
 *
 * Common content is shared to prevent divergence.
 */

/** Claude Code specific exports (task mode workflow via hooks) */
export {
  CLAUDE_CODE_HEADER,
  CLAUDE_CODE_INSTRUCTIONS,
  IMPORTANT_NOTES,
  TASK_MODE_WORKFLOW,
} from './claude-code.js';

/** Common sections used by both platforms */
export {
  ARTIFACT_TYPES_SECTION,
  COMMON_INSTRUCTIONS,
  CRITICAL_USAGE_SECTION,
  DELIVERABLES_SECTION,
  TIPS_SECTION,
  TROUBLESHOOTING_SECTION,
  USER_INPUT_SECTION,
  WHEN_NOT_TO_USE_SECTION,
} from './common.js';

/** MCP-direct platform exports (Cursor, Windsurf, etc.) */
export {
  API_REFERENCE,
  HANDLING_FEEDBACK,
  MCP_DIRECT_HEADER,
  MCP_DIRECT_INSTRUCTIONS,
  MCP_TOOLS_OVERVIEW,
  MCP_WORKFLOW,
} from './mcp-direct.js';
