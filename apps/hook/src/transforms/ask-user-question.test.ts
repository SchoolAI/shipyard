/**
 * Tests for request_user_input → AskUserQuestion transformation
 */

import { describe, expect, it } from 'vitest';
import { transformToAskUserQuestion } from './ask-user-question.js';

describe('transformToAskUserQuestion', () => {
  describe('choice type with valid options', () => {
    it('should transform choice request with 2 options', () => {
      const result = transformToAskUserQuestion({
        message: 'Which database should we use?',
        type: 'choice',
        options: ['PostgreSQL', 'SQLite'],
      });

      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        expect(result.tool_name).toBe('AskUserQuestion');
        expect(result.tool_input.questions).toHaveLength(1);
        expect(result.tool_input.questions[0]).toMatchObject({
          question: 'Which database should we use?',
          header: 'Database',
          multiSelect: false,
          options: [
            { label: 'PostgreSQL', description: 'PostgreSQL' },
            { label: 'SQLite', description: 'SQLite' },
          ],
        });
      }
    });

    it('should transform choice request with 4 options', () => {
      const result = transformToAskUserQuestion({
        message: 'What styling approach would you prefer?',
        type: 'choice',
        options: ['Tailwind CSS', 'Bootstrap', 'Vanilla CSS', 'Styled Components'],
      });

      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        expect(result.tool_input.questions[0]?.options).toHaveLength(4);
      }
    });

    it('should generate header from meaningful word in question', () => {
      const result = transformToAskUserQuestion({
        message: 'Which styling framework should we use?',
        type: 'choice',
        options: ['Tailwind', 'Bootstrap'],
      });

      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        expect(result.tool_input.questions[0]?.header).toBe('Styling');
      }
    });

    it('should truncate long headers to 12 chars', () => {
      const result = transformToAskUserQuestion({
        message: 'Which authentication provider should we use?',
        type: 'choice',
        options: ['Auth0', 'Clerk'],
      });

      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        expect(result.tool_input.questions[0]?.header).toBe('Authenticati'); // 14 chars -> 12
        expect(result.tool_input.questions[0]?.header?.length).toBeLessThanOrEqual(12);
      }
    });
  });

  describe('passthrough cases', () => {
    it('should pass through text type', () => {
      const result = transformToAskUserQuestion({
        message: 'Enter your API key',
        type: 'text',
      });

      expect(result.type).toBe('passthrough');
    });

    it('should pass through multiline type', () => {
      const result = transformToAskUserQuestion({
        message: 'Describe the issue',
        type: 'multiline',
      });

      expect(result.type).toBe('passthrough');
    });

    it('should pass through confirm type', () => {
      const result = transformToAskUserQuestion({
        message: 'Are you sure you want to delete?',
        type: 'confirm',
      });

      expect(result.type).toBe('passthrough');
    });

    it('should pass through choice with < 2 options', () => {
      const result = transformToAskUserQuestion({
        message: 'Choose one',
        type: 'choice',
        options: ['Only option'],
      });

      expect(result.type).toBe('passthrough');
    });

    it('should pass through choice with > 4 options', () => {
      const result = transformToAskUserQuestion({
        message: 'Choose one',
        type: 'choice',
        options: ['Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5'],
      });

      expect(result.type).toBe('passthrough');
    });

    it('should pass through choice without options array', () => {
      const result = transformToAskUserQuestion({
        message: 'Choose one',
        type: 'choice',
      });

      expect(result.type).toBe('passthrough');
    });
  });

  describe('header generation edge cases', () => {
    it('should skip common question words and use meaningful word', () => {
      const result = transformToAskUserQuestion({
        message: 'What framework should we use?',
        type: 'choice',
        options: ['React', 'Vue'],
      });

      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        expect(result.tool_input.questions[0]?.header).toBe('Framework');
      }
    });

    it('should fallback to "Choice" if no meaningful word found', () => {
      const result = transformToAskUserQuestion({
        message: 'Which should do what?',
        type: 'choice',
        options: ['A', 'B'],
      });

      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        expect(result.tool_input.questions[0]?.header).toBe('Choice');
      }
    });

    it('should capitalize first letter of header', () => {
      const result = transformToAskUserQuestion({
        message: 'framework choice?',
        type: 'choice',
        options: ['A', 'B'],
      });

      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        const header = result.tool_input.questions[0]?.header;
        expect(header[0]).toBe(header[0].toUpperCase());
      }
    });
  });
});
