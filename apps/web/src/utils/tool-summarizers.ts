/**
 * Human-readable summaries for common tool actions.
 * Shared between PermissionCard (pending tool calls) and ToolUseCard (completed tool calls).
 */

export function truncateToolInput(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

function getStringField(input: Record<string, unknown>, key: string, fallback: string): string {
  const val = input[key];
  return typeof val === 'string' ? val : fallback;
}

function summarizeBash(input: Record<string, unknown>): string {
  return truncateToolInput(getStringField(input, 'command', ''), 120);
}

function summarizeEdit(input: Record<string, unknown>): string {
  const filePath = getStringField(input, 'file_path', 'file');
  const oldStr = getStringField(input, 'old_string', '');
  const lineCount = oldStr.split('\n').length;
  return `${filePath} — editing ${lineCount} line${lineCount === 1 ? '' : 's'}`;
}

function summarizeWrite(input: Record<string, unknown>): string {
  return `${getStringField(input, 'file_path', 'file')} — creating file`;
}

function summarizeRead(input: Record<string, unknown>): string {
  return getStringField(input, 'file_path', 'file');
}

function summarizeGlob(input: Record<string, unknown>): string {
  const pattern = getStringField(input, 'pattern', '*');
  const path = getStringField(input, 'path', '');
  return path ? `${pattern} in ${path}` : pattern;
}

function summarizeGrep(input: Record<string, unknown>): string {
  const pattern = getStringField(input, 'pattern', '');
  const path = getStringField(input, 'path', '');
  return path ? `/${pattern}/ in ${path}` : `/${pattern}/`;
}

export const TOOL_SUMMARIZERS: Record<string, (input: Record<string, unknown>) => string> = {
  Bash: summarizeBash,
  Edit: summarizeEdit,
  Write: summarizeWrite,
  Read: summarizeRead,
  Glob: summarizeGlob,
  Grep: summarizeGrep,
};

/**
 * Produce a human-readable summary of the tool action from its input JSON.
 * Falls back to a truncated raw input string for unknown tools.
 */
export function summarizeToolAction(toolName: string, toolInput: string): string {
  try {
    // eslint-disable-next-line no-restricted-syntax -- toolInput is daemon-serialized JSON, shape is known at write site
    const input = JSON.parse(toolInput) as Record<string, unknown>;
    const summarizer = TOOL_SUMMARIZERS[toolName];
    if (summarizer) return summarizer(input);
    return `${toolName}: ${truncateToolInput(toolInput, 100)}`;
  } catch {
    return `${toolName}: ${truncateToolInput(toolInput, 100)}`;
  }
}

/**
 * Icon label for known tools, used in ToolUseCard badges.
 */
export const TOOL_ICON_LABELS: Record<string, string> = {
  Bash: 'Terminal',
  Edit: 'Edit file',
  Write: 'Write file',
  Read: 'Read file',
  Glob: 'Find files',
  Grep: 'Search',
  Task: 'Subagent',
};
