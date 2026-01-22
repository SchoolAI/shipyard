/**
 * Environment context for agent identification.
 * Helps users distinguish agents working from different machines/branches/projects.
 *
 * Used in:
 * - WebRTC awareness protocol for real-time presence display
 * - Broadcast by MCP servers to show where they're running from
 * - Displayed in browser UI tooltips
 */
export interface EnvironmentContext {
  /** Project directory name (e.g., "shipyard") */
  projectName?: string;
  /** Git branch name (e.g., "feature/auth") */
  branch?: string;
  /** Machine hostname (e.g., "jacobs-macbook") */
  hostname?: string;
  /** GitHub repo (e.g., "SchoolAI/shipyard") */
  repo?: string;
}
