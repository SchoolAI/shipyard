/**
 * Utility for injecting Shipyard plan context into A2A conversations.
 * Inserts context as a user message before the last user message.
 */

import type { A2AMessage } from '@shipyard/schema';
import { nanoid } from 'nanoid';

interface InjectionOptions {
  planId: string;
  sessionToken: string;
  webUrl: string;
  additionalPrompt?: string;
}

/**
 * Injects Shipyard context into an A2A conversation.
 * Context is inserted as a user message before the last user message.
 *
 * @param messages - Original A2A messages
 * @param options - Plan context to inject
 * @returns Modified message array with injected context
 */
export function injectShipyardContext(
  messages: A2AMessage[],
  options: InjectionOptions
): A2AMessage[] {
  const contextText = buildContextText(options);

  const contextMessage: A2AMessage = {
    messageId: `shipyard-context-${nanoid()}`,
    role: 'user',
    parts: [{ type: 'text', text: contextText }],
    contextId: options.planId,
  };

  /** Find last user message index */
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  /** Edge case: no user messages or only one - prepend */
  if (lastUserIdx <= 0) {
    return [contextMessage, ...messages];
  }

  /** Normal case: insert before last user message */
  return [...messages.slice(0, lastUserIdx), contextMessage, ...messages.slice(lastUserIdx)];
}

function buildContextText(options: InjectionOptions): string {
  const parts = [
    `[Shipyard Context - Plan ID: ${options.planId}]`,
    '',
    `You are working on a Shipyard plan. Session token: ${options.sessionToken}`,
    '',
    `View plan: ${options.webUrl}`,
    '',
    'Shipyard MCP tools available:',
    '- read_task: Check for feedback and comments',
    '- add_artifact: Upload proof for deliverables',
    '- execute_code: Run code and use requestUserInput() for user interaction',
  ];

  if (options.additionalPrompt) {
    parts.push('', `Additional instructions: ${options.additionalPrompt}`);
  }

  parts.push('', 'IMPORTANT: Check the plan URL for human feedback before proceeding.');

  return parts.join('\n');
}
