/**
 * Shared utility for extracting plan markdown from ExitPlanMode tool input.
 *
 * Used by:
 * - apps/web/src/utils/group-content-blocks.ts (UI grouping)
 * - apps/web/src/utils/tool-summarizers.ts (tool summaries)
 * - apps/daemon/src/session-manager.ts (plan extraction from SDK messages)
 */

export function extractPlanMarkdown(toolInput: string): string {
  try {
    // eslint-disable-next-line no-restricted-syntax
    const parsed = JSON.parse(toolInput) as Record<string, unknown>;
    return typeof parsed.plan === 'string' ? parsed.plan : '';
  } catch {
    return '';
  }
}
