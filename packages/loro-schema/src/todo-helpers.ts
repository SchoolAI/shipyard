export interface RawTodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidRawTodo(item: unknown): item is RawTodoItem {
  if (!isRecord(item)) return false;
  return (
    typeof item.content === 'string' &&
    typeof item.status === 'string' &&
    VALID_STATUSES.has(item.status) &&
    typeof item.activeForm === 'string'
  );
}

/**
 * Extract raw todo items from TodoWrite tool input JSON string.
 * Returns empty array on parse failure or invalid structure.
 */
export function extractTodoItems(toolInput: string): RawTodoItem[] {
  try {
    const parsed: unknown = JSON.parse(toolInput);
    if (!isRecord(parsed)) return [];
    const todos = parsed.todos;
    if (!Array.isArray(todos)) return [];
    return todos.filter(isValidRawTodo);
  } catch {
    return [];
  }
}

/**
 * Extract old/new todo diff from TodoWrite tool result JSON string.
 * Used by inline chat chips to show what changed at each call.
 */
export function extractTodoDiff(toolResult: string): {
  oldTodos: RawTodoItem[];
  newTodos: RawTodoItem[];
} | null {
  try {
    const parsed: unknown = JSON.parse(toolResult);
    if (!isRecord(parsed)) return null;
    const oldTodos = Array.isArray(parsed.oldTodos) ? parsed.oldTodos.filter(isValidRawTodo) : [];
    const newTodos = Array.isArray(parsed.newTodos) ? parsed.newTodos.filter(isValidRawTodo) : [];
    return { oldTodos, newTodos };
  } catch {
    return null;
  }
}
