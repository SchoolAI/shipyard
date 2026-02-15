import { describe, expect, it } from 'vitest';
import {
  summarizeToolAction,
  TOOL_ICON_LABELS,
  TOOL_SUMMARIZERS,
  truncateToolInput,
} from './tool-summarizers';

describe('truncateToolInput', () => {
  it('returns the string unchanged when within the limit', () => {
    expect(truncateToolInput('short', 10)).toBe('short');
  });

  it('truncates and appends ellipsis when exceeding the limit', () => {
    expect(truncateToolInput('abcdefghij', 5)).toBe('abcde...');
  });

  it('handles exact boundary length without truncation', () => {
    expect(truncateToolInput('exact', 5)).toBe('exact');
  });

  it('handles empty string', () => {
    expect(truncateToolInput('', 10)).toBe('');
  });
});

describe('summarizeToolAction', () => {
  describe('Bash', () => {
    it('returns the command string', () => {
      const input = JSON.stringify({ command: 'npm test' });
      expect(summarizeToolAction('Bash', input)).toBe('npm test');
    });

    it('truncates long commands at 120 characters', () => {
      const longCommand = 'x'.repeat(200);
      const input = JSON.stringify({ command: longCommand });
      const result = summarizeToolAction('Bash', input);
      expect(result).toBe(`${'x'.repeat(120)}...`);
    });

    it('returns empty string when command field is missing', () => {
      const input = JSON.stringify({});
      expect(summarizeToolAction('Bash', input)).toBe('');
    });
  });

  describe('Edit', () => {
    it('returns file path with line count', () => {
      const input = JSON.stringify({
        file_path: '/src/app.ts',
        old_string: 'line1\nline2\nline3',
      });
      expect(summarizeToolAction('Edit', input)).toBe('/src/app.ts — editing 3 lines');
    });

    it('uses singular for single line edit', () => {
      const input = JSON.stringify({
        file_path: '/src/app.ts',
        old_string: 'single line',
      });
      expect(summarizeToolAction('Edit', input)).toBe('/src/app.ts — editing 1 line');
    });

    it('falls back to "file" when file_path is missing', () => {
      const input = JSON.stringify({ old_string: 'something' });
      expect(summarizeToolAction('Edit', input)).toBe('file — editing 1 line');
    });
  });

  describe('Write', () => {
    it('returns file path with creating label', () => {
      const input = JSON.stringify({ file_path: '/src/new-file.ts' });
      expect(summarizeToolAction('Write', input)).toBe('/src/new-file.ts — creating file');
    });

    it('falls back to "file" when file_path is missing', () => {
      const input = JSON.stringify({});
      expect(summarizeToolAction('Write', input)).toBe('file — creating file');
    });
  });

  describe('Read', () => {
    it('returns the file path', () => {
      const input = JSON.stringify({ file_path: '/src/config.ts' });
      expect(summarizeToolAction('Read', input)).toBe('/src/config.ts');
    });

    it('falls back to "file" when file_path is missing', () => {
      const input = JSON.stringify({});
      expect(summarizeToolAction('Read', input)).toBe('file');
    });
  });

  describe('Glob', () => {
    it('returns pattern with path when both provided', () => {
      const input = JSON.stringify({ pattern: '**/*.ts', path: '/src' });
      expect(summarizeToolAction('Glob', input)).toBe('**/*.ts in /src');
    });

    it('returns pattern alone when path is absent', () => {
      const input = JSON.stringify({ pattern: '**/*.ts' });
      expect(summarizeToolAction('Glob', input)).toBe('**/*.ts');
    });

    it('returns pattern alone when path is empty string', () => {
      const input = JSON.stringify({ pattern: '*.json', path: '' });
      expect(summarizeToolAction('Glob', input)).toBe('*.json');
    });

    it('falls back to * when pattern is missing', () => {
      const input = JSON.stringify({});
      expect(summarizeToolAction('Glob', input)).toBe('*');
    });
  });

  describe('Grep', () => {
    it('returns pattern with path when both provided', () => {
      const input = JSON.stringify({ pattern: 'TODO', path: '/src' });
      expect(summarizeToolAction('Grep', input)).toBe('/TODO/ in /src');
    });

    it('returns pattern alone when path is absent', () => {
      const input = JSON.stringify({ pattern: 'FIXME' });
      expect(summarizeToolAction('Grep', input)).toBe('/FIXME/');
    });

    it('returns pattern alone when path is empty string', () => {
      const input = JSON.stringify({ pattern: 'FIXME', path: '' });
      expect(summarizeToolAction('Grep', input)).toBe('/FIXME/');
    });
  });

  describe('unknown tool', () => {
    it('returns tool name with truncated input', () => {
      const input = JSON.stringify({ foo: 'bar' });
      expect(summarizeToolAction('CustomTool', input)).toBe(`CustomTool: ${input}`);
    });

    it('truncates long input at 100 characters', () => {
      const longValue = 'v'.repeat(200);
      const input = JSON.stringify({ data: longValue });
      const result = summarizeToolAction('CustomTool', input);
      expect(result).toBe(`CustomTool: ${input.slice(0, 100)}...`);
    });
  });

  describe('invalid JSON input', () => {
    it('returns tool name with raw input on parse failure', () => {
      expect(summarizeToolAction('Bash', 'not json')).toBe('Bash: not json');
    });

    it('truncates invalid JSON input at 100 characters', () => {
      const longBad = 'z'.repeat(200);
      expect(summarizeToolAction('Bash', longBad)).toBe(`Bash: ${'z'.repeat(100)}...`);
    });
  });
});

describe('TOOL_SUMMARIZERS', () => {
  it('has entries for all six known tools', () => {
    expect(Object.keys(TOOL_SUMMARIZERS)).toEqual(
      expect.arrayContaining(['Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep'])
    );
  });

  it('every value is a function', () => {
    for (const fn of Object.values(TOOL_SUMMARIZERS)) {
      expect(typeof fn).toBe('function');
    }
  });
});

describe('TOOL_ICON_LABELS', () => {
  it('has entries for known tools', () => {
    expect(TOOL_ICON_LABELS.Bash).toBe('Terminal');
    expect(TOOL_ICON_LABELS.Edit).toBe('Edit file');
    expect(TOOL_ICON_LABELS.Write).toBe('Write file');
    expect(TOOL_ICON_LABELS.Read).toBe('Read file');
    expect(TOOL_ICON_LABELS.Glob).toBe('Find files');
    expect(TOOL_ICON_LABELS.Grep).toBe('Search');
    expect(TOOL_ICON_LABELS.Task).toBe('Subagent');
  });
});
