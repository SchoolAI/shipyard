import { describe, expect, it } from 'vitest';
import { extractTodoDiff, extractTodoItems } from './todo-helpers.js';

describe('extractTodoItems', () => {
  it('returns items from valid JSON with todos array', () => {
    const input = JSON.stringify({
      todos: [
        { content: 'Write tests', status: 'pending', activeForm: 'Write tests' },
        { content: 'Ship feature', status: 'in_progress', activeForm: 'Shipping feature' },
        { content: 'Deploy', status: 'completed', activeForm: 'Deployed' },
      ],
    });
    const result = extractTodoItems(input);
    expect(result).toEqual([
      { content: 'Write tests', status: 'pending', activeForm: 'Write tests' },
      { content: 'Ship feature', status: 'in_progress', activeForm: 'Shipping feature' },
      { content: 'Deploy', status: 'completed', activeForm: 'Deployed' },
    ]);
  });

  it('returns empty array when todos key is missing', () => {
    const input = JSON.stringify({ items: [{ content: 'a', status: 'pending', activeForm: 'a' }] });
    expect(extractTodoItems(input)).toEqual([]);
  });

  it('filters out items with invalid status values', () => {
    const input = JSON.stringify({
      todos: [
        { content: 'Valid', status: 'pending', activeForm: 'Valid' },
        { content: 'Bad status', status: 'done', activeForm: 'Bad status' },
        { content: 'Also bad', status: 'unknown', activeForm: 'Also bad' },
      ],
    });
    const result = extractTodoItems(input);
    expect(result).toEqual([{ content: 'Valid', status: 'pending', activeForm: 'Valid' }]);
  });

  it('returns empty array for malformed JSON', () => {
    expect(extractTodoItems('not valid json {')).toEqual([]);
    expect(extractTodoItems('')).toEqual([]);
  });

  it('returns empty array for non-object input', () => {
    expect(extractTodoItems(JSON.stringify('a string'))).toEqual([]);
    expect(extractTodoItems(JSON.stringify(42))).toEqual([]);
    expect(extractTodoItems(JSON.stringify(null))).toEqual([]);
    expect(extractTodoItems(JSON.stringify(true))).toEqual([]);
    expect(extractTodoItems(JSON.stringify([1, 2, 3]))).toEqual([]);
  });
});

describe('extractTodoDiff', () => {
  it('returns old and new todos from valid diff JSON', () => {
    const input = JSON.stringify({
      oldTodos: [{ content: 'A', status: 'pending', activeForm: 'A' }],
      newTodos: [
        { content: 'A', status: 'completed', activeForm: 'Completed A' },
        { content: 'B', status: 'pending', activeForm: 'B' },
      ],
    });
    const result = extractTodoDiff(input);
    expect(result).toEqual({
      oldTodos: [{ content: 'A', status: 'pending', activeForm: 'A' }],
      newTodos: [
        { content: 'A', status: 'completed', activeForm: 'Completed A' },
        { content: 'B', status: 'pending', activeForm: 'B' },
      ],
    });
  });

  it('returns empty arrays when oldTodos and newTodos are missing', () => {
    const input = JSON.stringify({ unrelated: 'data' });
    const result = extractTodoDiff(input);
    expect(result).toEqual({ oldTodos: [], newTodos: [] });
  });

  it('returns null for malformed JSON', () => {
    expect(extractTodoDiff('not valid json {')).toBeNull();
    expect(extractTodoDiff('')).toBeNull();
  });
});
