/**
 * Transformation layer: request_user_input → Browser Modal
 *
 * All request_user_input calls now passthrough to browser modal for consistent UX.
 *
 * Transformation Rules:
 * - Passthrough: All types → Browser modal via MCP tool
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
    header: string;
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
 * All types now use browser modal for consistent UX.
 */
export function transformToAskUserQuestion(params: RequestUserInputParams): HookResponse {
  logger.debug({ type: params.type }, 'Passing through to browser modal (all types)');
  return { type: 'passthrough' };
}
