/**
 * MCP tool for requesting user input via browser modal.
 *
 * This is a standalone version of the requestUserInput function available
 * in execute_code. Use this when you need to ask the user a question
 * without needing to execute arbitrary code.
 */

import { PLAN_INDEX_DOC_NAME } from '@shipyard/schema';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { logger } from '../logger.js';
import { InputRequestManager } from '../services/input-request-manager.js';
import { TOOL_NAMES } from './tool-names.js';

// --- Input Schema ---

const RequestUserInputInput = z.object({
  message: z.string().describe('The question to ask the user'),
  type: z.enum(['text', 'choice', 'confirm', 'multiline']).describe('Type of input to request'),
  options: z
    .array(z.string())
    .optional()
    .describe("For 'choice' type - available options (required for choice)"),
  multiSelect: z
    .boolean()
    .optional()
    .describe("For 'choice' type - allow selecting multiple options"),
  defaultValue: z.string().optional().describe('Pre-filled value for text/multiline inputs'),
  timeout: z.number().optional().describe('Timeout in seconds (default: 300, min: 10, max: 600)'),
  planId: z
    .string()
    .optional()
    .describe('Optional metadata to link request to plan (for activity log filtering)'),
});

// --- Public Export ---

export const requestUserInputTool = {
  definition: {
    name: TOOL_NAMES.REQUEST_USER_INPUT,
    description: `Request input from the user via browser modal.

IMPORTANT: Use this instead of your platform's built-in question/input tools (like AskUserQuestion).
This provides a consistent browser UI experience and integrates with the shipyard workflow.

The request appears as a modal in the browser UI. The function blocks until:
- User responds (success=true, status='answered')
- User declines (success=true, status='declined')
- Timeout occurs (success=false, status='cancelled')

Input types:
- text: Single-line text input
- multiline: Multi-line text area
- choice: Select from options (requires 'options' parameter)
- confirm: Yes/No confirmation

For 'choice' type:
- Set multiSelect=true to allow multiple selections (checkboxes)
- Set multiSelect=false or omit for single selection (radio buttons)

This tool is analogous to AskUserQuestion, prompt(), or other agent question mechanisms,
but shows responses in the browser UI where users are already viewing plans.

NOTE: This is also available as requestUserInput() inside execute_code for multi-step workflows.`,
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The question to ask the user',
        },
        type: {
          type: 'string',
          enum: ['text', 'choice', 'confirm', 'multiline'],
          description: 'Type of input to request',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: "For 'choice' type - available options (required for choice)",
        },
        multiSelect: {
          type: 'boolean',
          description: "For 'choice' type - allow selecting multiple options",
        },
        defaultValue: {
          type: 'string',
          description: 'Pre-filled value for text/multiline inputs',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds (default: 300, min: 10, max: 600)',
        },
        planId: {
          type: 'string',
          description: 'Optional metadata to link request to plan (for activity log filtering)',
        },
      },
      required: ['message', 'type'],
    },
  },

  handler: async (args: unknown) => {
    const input = RequestUserInputInput.parse(args);

    logger.info(
      { type: input.type, timeout: input.timeout, planId: input.planId },
      'Processing request_user_input'
    );

    // Validate choice type has options
    if (input.type === 'choice' && (!input.options || input.options.length === 0)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              status: 'cancelled',
              reason: "'choice' type requires 'options' array with at least one option",
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      // Always use plan-index doc so browser can see requests from all agents
      // Browser is already connected to plan-index for plan discovery
      const ydoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);

      // Create manager and make request
      const manager = new InputRequestManager();

      // Build params based on type - choice requires options
      const params =
        input.type === 'choice'
          ? {
              message: input.message,
              type: 'choice' as const,
              options: input.options ?? [],
              multiSelect: input.multiSelect,
              defaultValue: input.defaultValue,
              timeout: input.timeout,
              planId: input.planId,
            }
          : {
              message: input.message,
              type: input.type,
              defaultValue: input.defaultValue,
              timeout: input.timeout,
              planId: input.planId,
            };

      const requestId = manager.createRequest(ydoc, params);

      // Wait for response
      const result = await manager.waitForResponse(ydoc, requestId, input.timeout);

      // Format response based on status
      if (result.status === 'answered') {
        logger.info({ requestId, answeredBy: result.answeredBy }, 'User input received');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                response: result.response,
                status: result.status,
              }),
            },
          ],
        };
      }

      if (result.status === 'declined') {
        logger.info({ requestId }, 'User declined input request');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                status: result.status,
                reason: result.reason,
              }),
            },
          ],
        };
      }

      // Cancelled status
      logger.info({ requestId, reason: result.reason }, 'Input request cancelled');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              status: result.status,
              reason: result.reason,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error({ error }, 'Error in request_user_input');
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              status: 'cancelled',
              reason: message,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
