import { nanoid } from 'nanoid';
import { z } from 'zod';

/**
 * Default timeout in seconds for input requests when not explicitly specified.
 * Used as fallback in:
 * - InputRequestModal.tsx (browser countdown)
 * - InputRequestInboxItem.tsx (browser countdown display)
 * - useInputRequests.ts (client-side expiration check)
 *
 * Server-side timeout in input-request-manager.ts uses the request's timeout
 * or 0 (no timeout) if not specified, but clients use this default for UI display.
 */
export const DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS = 1800;

/**
 * Valid input request types.
 * - text: Single-line text input
 * - multiline: Multi-line text input
 * - choice: Select from predefined options
 * - confirm: Boolean yes/no question
 */
export const InputRequestTypeValues = ['text', 'multiline', 'choice', 'confirm'] as const;
export type InputRequestType = (typeof InputRequestTypeValues)[number];

/**
 * Valid status values for an input request.
 * - pending: Awaiting user response
 * - answered: User has responded
 * - declined: User explicitly declined to answer
 * - cancelled: Request cancelled (timeout)
 */
export const InputRequestStatusValues = ['pending', 'answered', 'declined', 'cancelled'] as const;
export type InputRequestStatus = (typeof InputRequestStatusValues)[number];

const InputRequestBaseSchema = z.object({
  /** Unique request ID */
  id: z.string(),
  /** When the request was created (Unix timestamp in ms) */
  createdAt: z.number(),
  /** Prompt message shown to the user */
  message: z.string().min(1, 'Message cannot be empty'),
  /** Current status of the request */
  status: z.enum(InputRequestStatusValues),
  /** Default value to pre-populate the input */
  defaultValue: z.string().optional(),
  /** Timeout in seconds (0 = no timeout) */
  timeout: z
    .number()
    .int()
    .min(300, 'Timeout must be at least 5 minutes (300 seconds)')
    .max(1800, 'Timeout cannot exceed 30 minutes (1800 seconds)')
    .optional(),
  /** Optional plan ID to associate request with a specific plan (null/undefined = global) */
  planId: z.string().optional(),
  /** User's response (any JSON-serializable value) */
  response: z.unknown().optional(),
  /** When the user answered (Unix timestamp in ms) */
  answeredAt: z.number().optional(),
  /** Who answered (username or "agent") */
  answeredBy: z.string().optional(),
});

/** Text input request - single line text entry */
const TextInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('text'),
});

/** Multiline input request - multi-line text entry */
const MultilineInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('multiline'),
});

/** Choice input request - select from predefined options */
const ChoiceInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('choice'),
  /** Available options - REQUIRED for choice type */
  options: z.array(z.string()).min(1, 'Choice requests must have at least one option'),
  /** Enable multi-select for 'choice' type (uses checkboxes instead of radio buttons) */
  multiSelect: z.boolean().optional(),
});

/** Confirm input request - boolean yes/no question */
const ConfirmInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('confirm'),
});

/**
 * Schema for an input request stored in Y.Doc.
 * Uses discriminated union on 'type' field to ensure:
 * - 'choice' type REQUIRES options array
 * - Other types don't have options
 *
 * Follows CRDT patterns from existing Shipyard schemas.
 */
export const InputRequestSchema = z.discriminatedUnion('type', [
  TextInputSchema,
  MultilineInputSchema,
  ChoiceInputSchema,
  ConfirmInputSchema,
]);

export type InputRequest = z.infer<typeof InputRequestSchema>;

export type TextInputRequest = z.infer<typeof TextInputSchema>;
export type MultilineInputRequest = z.infer<typeof MultilineInputSchema>;
export type ChoiceInputRequest = z.infer<typeof ChoiceInputSchema>;
export type ConfirmInputRequest = z.infer<typeof ConfirmInputSchema>;

/** Base params for creating any input request */
interface CreateInputRequestBaseParams {
  message: string;
  defaultValue?: string;
  timeout?: number;
  planId?: string;
}

/** Params for creating a text input request */
export interface CreateTextInputParams extends CreateInputRequestBaseParams {
  type: 'text';
}

/** Params for creating a multiline input request */
export interface CreateMultilineInputParams extends CreateInputRequestBaseParams {
  type: 'multiline';
}

/** Params for creating a choice input request */
export interface CreateChoiceInputParams extends CreateInputRequestBaseParams {
  type: 'choice';
  /** Required: available options for selection */
  options: string[];
  /** Enable multi-select (uses checkboxes instead of radio buttons) */
  multiSelect?: boolean;
}

/** Params for creating a confirm input request */
export interface CreateConfirmInputParams extends CreateInputRequestBaseParams {
  type: 'confirm';
}

/**
 * Parameters for creating a new input request.
 * Discriminated union ensures 'choice' type requires options.
 */
export type CreateInputRequestParams =
  | CreateTextInputParams
  | CreateMultilineInputParams
  | CreateChoiceInputParams
  | CreateConfirmInputParams;

/**
 * Create a new input request with auto-generated fields.
 * Sets id, createdAt, and status to initial values.
 *
 * @param params - Request parameters (discriminated by type)
 * @returns Complete InputRequest ready to store in Y.Doc
 */
export function createInputRequest(params: CreateInputRequestParams): InputRequest {
  const baseFields = {
    id: nanoid(),
    createdAt: Date.now(),
    message: params.message,
    defaultValue: params.defaultValue,
    status: 'pending' as const,
    timeout: params.timeout,
    planId: params.planId,
  };

  let request: unknown;

  switch (params.type) {
    case 'text':
      request = { ...baseFields, type: 'text' as const };
      break;
    case 'multiline':
      request = { ...baseFields, type: 'multiline' as const };
      break;
    case 'choice':
      request = {
        ...baseFields,
        type: 'choice' as const,
        options: params.options,
        multiSelect: params.multiSelect,
      };
      break;
    case 'confirm':
      request = { ...baseFields, type: 'confirm' as const };
      break;
  }

  const parseResult = InputRequestSchema.safeParse(request);
  if (!parseResult.success) {
    throw new Error(`Invalid input request: ${parseResult.error.issues[0]?.message}`);
  }

  return parseResult.data;
}
