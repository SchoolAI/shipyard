/**
 * MCP tool for requesting user input via browser modal.
 *
 * This is a standalone version of the requestUserInput function available
 * in execute_code. Use this when you need to ask the user a question
 * without needing to execute arbitrary code.
 */

import { PLAN_INDEX_DOC_NAME, QuestionSchema } from '@shipyard/schema';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { logger } from '../logger.js';
import { InputRequestManager } from '../services/input-request-manager.js';
import { TOOL_NAMES } from './tool-names.js';

/** --- Input Schema --- */

const RequestUserInputInput = z
  .object({
    message: z.string().optional().describe('The question to ask the user'),
    type: z
      .enum(['text', 'choice', 'confirm', 'multiline', 'number', 'email', 'date', 'rating'])
      .optional()
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
    placeholder: z
      .string()
      .optional()
      .describe("For 'choice' type with dropdown - placeholder text"),
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
    domain: z.string().optional().describe("For 'email' - restrict to domain"),
    // Rating type parameters
    style: z
      .enum(['stars', 'numbers', 'emoji'])
      .optional()
      .describe("For 'rating' - display style"),
    labels: z
      .object({
        low: z.string().optional(),
        high: z.string().optional(),
      })
      .optional()
      .describe("For 'rating' - endpoint labels"),
    // Multi-question support
    questions: z
      .array(QuestionSchema)
      .min(1)
      .max(10)
      .optional()
      .describe('Array of 1-10 questions for multi-question form (8 recommended for optimal UX)'),
  })
  .refine((data) => (data.message && data.type) || data.questions, {
    message: 'Either provide message+type OR questions array',
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

/** --- Public Export --- */

export const requestUserInputTool = {
  definition: {
    name: TOOL_NAMES.REQUEST_USER_INPUT,
    description: `THE primary human-agent communication channel in Shipyard.

**CRITICAL:** ALWAYS use this instead of platform-specific question tools (AskUserQuestion, Cursor prompts, etc.).
The human is already in the browser viewing your plan - that's where they expect to interact with you.
All communication should flow through Shipyard, not scattered across different interfaces.

The request appears as a modal in the browser UI. The function blocks until:
- User responds (success=true, status='answered')
- User declines (success=true, status='declined')
- Timeout occurs (success=false, status='cancelled')

## Usage Modes

### Single-Question Mode
Provide \`message\` and \`type\` parameters to ask one question.

### Multi-Question Mode
Provide \`questions\` array (1-10 questions, 8 recommended for optimal UX) to ask multiple questions in a single form.
Example:
\`\`\`
{
  questions: [
    { message: "Project name?", type: "text" },
    { message: "Which framework?", type: "choice", options: ["React", "Vue", "Angular"] }
  ],
  timeout: 300,
  planId: "plan_abc"
}
\`\`\`

## Input Types (8 total)

### 1. text - Single-line text input
Example: { message: "API endpoint URL?", type: "text", defaultValue: "https://api.example.com" }

### 2. multiline - Multi-line text area
Example: { message: "Describe the bug:", type: "multiline" }

### 3. choice - Select from options
Example: { message: "Which database?", type: "choice", options: ["PostgreSQL", "MySQL", "SQLite"] }
Notes:
- Automatically adds "Other (please specify)" option as escape hatch
- UI auto-switches: 1-8 options = radio/checkbox, 9+ = dropdown
- Set multiSelect=true for checkboxes (multiple selections)
- Set displayAs='dropdown' to force dropdown for any count

### 4. confirm - Yes/No decision
Example: { message: "Deploy to production?", type: "confirm" }
Response: "yes" or "no" (lowercase)

### 5. number - Numeric input with validation
Example: { message: "Port number?", type: "number", min: 1, max: 65535 }
Notes:
- format parameter: 'integer' | 'decimal' | 'currency' | 'percentage' (affects step size)
- Mobile shows numeric keypad

### 6. email - Email address with validation
Example: { message: "Contact email?", type: "email", domain: "company.com" }
Notes:
- Format validation enforced
- Optional domain restriction
- Mobile shows email keyboard

### 7. date - Date selection with range
Example: { message: "Project deadline?", type: "date", minDate: "2026-01-24", maxDate: "2026-12-31" }
Notes:
- ISO 8601 format (YYYY-MM-DD)
- Native date picker on mobile
- Response format: "2026-01-24"

### 8. rating - Scale rating
Example: { message: "Rate this approach (1-5):", type: "rating", min: 1, max: 5, labels: { low: "Poor", high: "Excellent" } }
Notes:
- Auto-selects style: stars for <=5, numbers for >5
- style parameter: 'stars' | 'numbers' | 'emoji' (optional override)
- Response format: integer as string (e.g., "4")

## Response Format

All responses are returned as strings:
- text/multiline: Raw string (multiline preserves newlines as \\n)
- choice (single): Selected option (e.g., "PostgreSQL")
- choice (multi): Comma-space separated (e.g., "PostgreSQL, SQLite")
- choice (other): Custom text entered by user (e.g., "Redis")
- confirm: "yes" or "no" (lowercase)
- number: Decimal representation (e.g., "42" or "3.14")
- email: Email address string (e.g., "user@example.com")
- date: ISO 8601 date (e.g., "2026-01-24")
- rating: Integer as string (e.g., "5")

See docs/INPUT-RESPONSE-FORMATS.md for complete specification.

## Usage Notes

This tool is analogous to AskUserQuestion, prompt(), or other agent question mechanisms,
but shows responses in the browser UI where users are already viewing plans.

Timeout guidelines:
- Simple yes/no or quick choices: 300-600 seconds (5-10 minutes)
- Complex questions with code examples: 600-1200 seconds (10-20 minutes)
- Default (1800 = 30 minutes) is suitable for most cases
- Note: System-level timeouts may cause earlier cancellation regardless of this value

NOTE: This is also available as requestUserInput() inside execute_code for multi-step workflows.`,
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The question to ask the user (required for single-question mode)',
        },
        type: {
          type: 'string',
          enum: ['text', 'choice', 'confirm', 'multiline', 'number', 'email', 'date', 'rating'],
          description: 'Type of input to request (required for single-question mode)',
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
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Question prompt' },
              type: {
                type: 'string',
                enum: [
                  'text',
                  'choice',
                  'confirm',
                  'multiline',
                  'number',
                  'email',
                  'date',
                  'rating',
                ],
                description: 'Question type',
              },
              defaultValue: { type: 'string', description: 'Pre-filled value' },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'For choice type',
              },
              multiSelect: { type: 'boolean', description: 'For choice type' },
              displayAs: {
                type: 'string',
                enum: ['radio', 'checkbox', 'dropdown'],
                description: 'For choice type',
              },
              placeholder: { type: 'string', description: 'For choice type' },
              min: { type: 'number', description: 'For number/rating type' },
              max: { type: 'number', description: 'For number/rating type' },
              format: {
                type: 'string',
                enum: ['integer', 'decimal', 'currency', 'percentage'],
                description: 'For number type',
              },
              domain: { type: 'string', description: 'For email type' },
              style: {
                type: 'string',
                enum: ['stars', 'numbers', 'emoji'],
                description: 'For rating type',
              },
              labels: {
                type: 'object',
                properties: {
                  low: { type: 'string' },
                  high: { type: 'string' },
                },
                description: 'For rating type',
              },
            },
            required: ['message', 'type'],
          },
          minItems: 1,
          maxItems: 10,
          description:
            'Array of 1-10 questions for multi-question mode (8 recommended for optimal UX). Mutually exclusive with message+type.',
        },
      },
      description:
        'Either provide message+type for single-question mode OR questions array for multi-question mode',
    },
  },

  handler: async (args: unknown) => {
    const input = RequestUserInputInput.parse(args);

    logger.info(
      {
        type: input.type,
        timeout: input.timeout,
        planId: input.planId,
        isMultiQuestion: !!input.questions,
      },
      'Processing request_user_input'
    );

    // Validate choice type has options (only for single-question mode)
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
      /*
       * Always use plan-index doc so browser can see requests from all agents
       * Browser is already connected to plan-index for plan discovery
       */
      const ydoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);

      /** Create manager and make request */
      const manager = new InputRequestManager();
      let requestId: string;

      if (input.questions) {
        // Multi-question request
        const params = {
          questions: input.questions,
          timeout: input.timeout,
          planId: input.planId,
        };
        requestId = manager.createMultiQuestionRequest(ydoc, params);
      } else {
        // Single-question request (existing logic)
        const params = buildRequestParams(input);
        // Cast through unknown since new types may not yet be in the schema
        requestId = manager.createRequest(
          ydoc,
          params as unknown as Parameters<typeof manager.createRequest>[1]
        );
      }

      /** Wait for response */
      const result = await manager.waitForResponse(ydoc, requestId, input.timeout);

      /** Format response based on status */
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

      /** Cancelled status */
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
