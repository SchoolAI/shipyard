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
  type: z
    .enum(['text', 'choice', 'confirm', 'multiline', 'number', 'email', 'date', 'rating'])
    .describe('Type of input to request'),
  options: z
    .array(z.string())
    .optional()
    .describe("For 'choice' type - available options (required)"),
  multiSelect: z
    .boolean()
    .optional()
    .describe("For 'choice' type - allow selecting multiple options"),
  displayAs: z
    .enum(['radio', 'checkbox', 'dropdown'])
    .optional()
    .describe("For 'choice' type - override automatic UI selection"),
  placeholder: z.string().optional().describe("For 'choice' type with dropdown - placeholder text"),
  defaultValue: z.string().optional().describe('Pre-filled value for text/multiline inputs'),
  timeout: z
    .number()
    .optional()
    .describe('Timeout in seconds (default: 1800, min: 10, max: 14400)'),
  planId: z
    .string()
    .optional()
    .describe('Optional metadata to link request to plan (for activity log filtering)'),
  // Number/rating type parameters
  min: z.number().optional().describe("For 'number'/'rating' - minimum value"),
  max: z.number().optional().describe("For 'number'/'rating' - maximum value"),
  // Date type parameters (separate from min/max since they're strings)
  minDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("For 'date' - minimum date in YYYY-MM-DD format"),
  maxDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("For 'date' - maximum date in YYYY-MM-DD format"),
  format: z
    .enum(['integer', 'decimal', 'currency', 'percentage'])
    .optional()
    .describe("For 'number' - display format hint (step is derived: integer=1, others=0.01)"),
  // Email type parameters
  allowMultiple: z.boolean().optional().describe("For 'email' - allow multiple emails"),
  domain: z.string().optional().describe("For 'email' - restrict to domain"),
  // Rating type parameters
  style: z.enum(['stars', 'numbers', 'emoji']).optional().describe("For 'rating' - display style"),
  labels: z
    .object({
      low: z.string().optional(),
      high: z.string().optional(),
    })
    .optional()
    .describe("For 'rating' - endpoint labels"),
});

// --- Helper Functions ---

type RequestUserInputInput = z.infer<typeof RequestUserInputInput>;

/** Build request params for choice type */
function buildChoiceParams(input: RequestUserInputInput, baseParams: Record<string, unknown>) {
  return {
    ...baseParams,
    type: 'choice' as const,
    options: input.options ?? [],
    multiSelect: input.multiSelect,
    displayAs: input.displayAs,
    placeholder: input.placeholder,
  };
}

/** Build request params for number type */
function buildNumberParams(input: RequestUserInputInput, baseParams: Record<string, unknown>) {
  return {
    ...baseParams,
    type: 'number' as const,
    min: input.min,
    max: input.max,
    format: input.format,
  };
}

/** Build request params for email type */
function buildEmailParams(input: RequestUserInputInput, baseParams: Record<string, unknown>) {
  return {
    ...baseParams,
    type: 'email' as const,
    allowMultiple: input.allowMultiple,
    domain: input.domain,
  };
}

/** Build request params for date type */
function buildDateParams(input: RequestUserInputInput, baseParams: Record<string, unknown>) {
  return {
    ...baseParams,
    type: 'date' as const,
    min: input.minDate,
    max: input.maxDate,
  };
}

/** Build request params for rating type */
function buildRatingParams(input: RequestUserInputInput, baseParams: Record<string, unknown>) {
  return {
    ...baseParams,
    type: 'rating' as const,
    min: input.min,
    max: input.max,
    style: input.style,
    labels: input.labels,
  };
}

/** Build request params based on input type */
function buildRequestParams(input: RequestUserInputInput): Record<string, unknown> {
  const baseParams = {
    message: input.message,
    defaultValue: input.defaultValue,
    timeout: input.timeout,
    planId: input.planId,
  };

  switch (input.type) {
    case 'choice':
      return buildChoiceParams(input, baseParams);
    case 'number':
      return buildNumberParams(input, baseParams);
    case 'email':
      return buildEmailParams(input, baseParams);
    case 'date':
      return buildDateParams(input, baseParams);
    case 'rating':
      return buildRatingParams(input, baseParams);
    default:
      // text, multiline, confirm
      return {
        ...baseParams,
        type: input.type,
      };
  }
}

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
- choice: Select from options (requires 'options' parameter). UI auto-switches:
  - 1-8 options: Radio buttons (single) or checkboxes (multi)
  - 9+ options: Searchable dropdown
  - Override with displayAs: 'dropdown' to force dropdown for any count
- confirm: Yes/No confirmation
- number: Numeric input with min/max bounds
- email: Email address with optional domain restriction
- date: Date selection with optional minDate/maxDate range (YYYY-MM-DD)
- rating: Scale rating (1-5 stars, numbers, or emoji)

For 'choice' type:
- Set multiSelect=true to allow multiple selections (checkboxes)
- Set multiSelect=false or omit for single selection (radio buttons)
- Set displayAs='dropdown' to force dropdown UI for any number of options

For 'number' type:
- min/max: Value bounds
- format: 'integer' | 'decimal' | 'currency' | 'percentage' (step is derived from format)

For 'rating' type:
- min/max: Rating scale (default 1-5)
- style: 'stars' | 'numbers' | 'emoji'
- labels: { low?: string, high?: string }

Response format:
- All responses are returned as strings
- Multi-select choices: comma-space separated (e.g., "option1, option2")
- Confirm: "yes" or "no" (lowercase)
- See docs/INPUT-RESPONSE-FORMATS.md for complete format specification

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
          enum: ['text', 'choice', 'confirm', 'multiline', 'number', 'email', 'date', 'rating'],
          description: 'Type of input to request',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: "For 'choice' type - available options (required)",
        },
        multiSelect: {
          type: 'boolean',
          description: "For 'choice' type - allow selecting multiple options",
        },
        displayAs: {
          type: 'string',
          enum: ['radio', 'checkbox', 'dropdown'],
          description:
            "For 'choice' type - override automatic UI selection. Default: auto-selects based on option count (1-8: radio/checkbox, 9+: dropdown)",
        },
        placeholder: {
          type: 'string',
          description: "For 'choice' type with dropdown UI - placeholder text",
        },
        defaultValue: {
          type: 'string',
          description: 'Pre-filled value for text/multiline inputs',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds (default: 1800, min: 10, max: 14400)',
        },
        planId: {
          type: 'string',
          description: 'Optional metadata to link request to plan (for activity log filtering)',
        },
        // Number/rating type parameters
        min: {
          type: 'number',
          description: "For 'number'/'rating' type - minimum allowed value",
        },
        max: {
          type: 'number',
          description: "For 'number'/'rating' type - maximum allowed value",
        },
        // Date type parameters (separate from min/max since they're strings)
        minDate: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: "For 'date' type - minimum date in YYYY-MM-DD format",
        },
        maxDate: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: "For 'date' type - maximum date in YYYY-MM-DD format",
        },
        format: {
          type: 'string',
          enum: ['integer', 'decimal', 'currency', 'percentage'],
          description:
            "For 'number' - display format hint (step is derived: integer=1, others=0.01)",
        },
        // Email type parameters
        allowMultiple: {
          type: 'boolean',
          description: "For 'email' - allow multiple comma-separated emails",
        },
        domain: {
          type: 'string',
          description: "For 'email' - restrict to specific domain",
        },
        // Rating type parameters
        style: {
          type: 'string',
          enum: ['stars', 'numbers', 'emoji'],
          description: "For 'rating' - display style",
        },
        labels: {
          type: 'object',
          properties: {
            low: { type: 'string' },
            high: { type: 'string' },
          },
          description: "For 'rating' - endpoint labels",
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
      const params = buildRequestParams(input);

      // Cast through unknown since new types may not yet be in the schema
      const requestId = manager.createRequest(
        ydoc,
        params as unknown as Parameters<typeof manager.createRequest>[1]
      );

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
