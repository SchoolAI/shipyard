/**
 * Transformation layer: request_user_input → AskUserQuestion
 *
 * Converts MCP tool calls to Claude Code's native AskUserQuestion when applicable.
 * This provides a better UX for Claude Code users by using native UI instead of browser modals.
 *
 * Transformation Rules:
 * - Transform: type='choice' AND 2-4 options → AskUserQuestion
 * - Passthrough: All other types → Browser modal via MCP tool
 */

import { logger } from '../logger.js';

/**
 * Input parameters for request_user_input MCP tool
 */
interface RequestUserInputParams {
  message: string;
  type: 'text' | 'choice' | 'confirm' | 'multiline';
  options?: string[];
  defaultValue?: string;
  timeout?: number;
}

/**
 * Claude Code AskUserQuestion format
 */
interface AskUserQuestionParams {
  questions: Array<{
    question: string;
    header: string; // Max 12 chars
    multiSelect: boolean;
    options: Array<{
      label: string;
      description: string;
    }>;
  }>;
}

/**
 * Hook response types
 */
interface TransformResponse {
  type: 'transform';
  tool_name: string;
  tool_input: AskUserQuestionParams;
}

interface PassthroughResponse {
  type: 'passthrough';
}

type HookResponse = TransformResponse | PassthroughResponse;

/**
 * Transform request_user_input to AskUserQuestion when applicable.
 *
 * Only transforms 'choice' type requests with 2-4 options.
 * Other types fall back to browser modal.
 */
export function transformToAskUserQuestion(params: RequestUserInputParams): HookResponse {
  // Only transform 'choice' type
  if (params.type !== 'choice') {
    logger.debug({ type: params.type }, 'Falling back to browser modal for non-choice type');
    return { type: 'passthrough' };
  }

  // Validate options exist and are in range
  if (!params.options || params.options.length < 2 || params.options.length > 4) {
    logger.debug(
      { optionCount: params.options?.length ?? 0 },
      'Falling back to browser modal: options must be 2-4'
    );
    return { type: 'passthrough' };
  }

  logger.info(
    {
      message: params.message,
      optionCount: params.options.length,
    },
    'Transforming request_user_input to AskUserQuestion'
  );

  // Generate header from message (max 12 chars)
  const header = generateHeader(params.message);

  return {
    type: 'transform',
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          question: params.message,
          header,
          multiSelect: false,
          options: params.options.map((opt) => ({
            label: opt,
            description: opt,
          })),
        },
      ],
    },
  };
}

/**
 * Generate a short header (max 12 chars) from a question message.
 *
 * Strategy:
 * 1. Extract first meaningful word
 * 2. Truncate to 12 chars
 * 3. Capitalize first letter
 */
function generateHeader(message: string): string {
  // Remove question mark and trim
  const cleaned = message.replace(/\?/g, '').trim();

  // Extract first few meaningful words
  const words = cleaned.split(/\s+/);

  // Common question starters to skip
  const skipWords = new Set(['which', 'what', 'how', 'should', 'would', 'can', 'do', 'does']);

  // Find first meaningful word
  let header = '';
  for (const word of words) {
    const lower = word.toLowerCase();
    if (!skipWords.has(lower) && word.length > 0) {
      header = word;
      break;
    }
  }

  // Fallback to "Choice" if no meaningful word found
  if (!header) {
    header = 'Choice';
  }

  // Truncate to 12 chars and capitalize
  header = header.slice(0, 12);
  return header.charAt(0).toUpperCase() + header.slice(1);
}
