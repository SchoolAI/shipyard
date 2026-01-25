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
 * - choice: Select from predefined options (auto-switches UI based on option count)
 * - confirm: Boolean yes/no question
 * - number: Numeric value with optional bounds
 * - email: Email address with optional domain restriction
 * - date: Date selection with optional range
 * - rating: Scale rating (1-5, 1-10, etc.)
 *
 * Note: 'dropdown' was merged into 'choice' - UI auto-switches to dropdown for 9+ options.
 */
export const InputRequestTypeValues = [
  'text',
  'multiline',
  'choice',
  'confirm',
  'number',
  'email',
  'date',
  'rating',
] as const;
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
    .min(10, 'Timeout must be at least 10 seconds')
    .max(14400, 'Timeout cannot exceed 4 hours')
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

/** Choice option can be simple string or rich object (backward compatible) */
export const ChoiceOptionSchema = z.union([
  z.string(),
  z.object({
    value: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    disabled: z.boolean().optional(),
  }),
]);

export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>;

/**
 * Choice input request - select from predefined options.
 * UI auto-switches based on option count:
 * - 1-8 options: Radio buttons (single) or checkboxes (multi)
 * - 9+ options: Searchable dropdown
 * Use displayAs to override auto-selection.
 */
const ChoiceInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('choice'),
  /** Available options - supports both string[] (old) and object[] (new) formats */
  options: z.array(ChoiceOptionSchema).min(1, 'Choice requests must have at least one option'),
  /** Enable multi-select for 'choice' type (uses checkboxes instead of radio buttons) */
  multiSelect: z.boolean().optional(),
  /** Override automatic UI selection (radio/checkbox vs dropdown) */
  displayAs: z.enum(['radio', 'checkbox', 'dropdown']).optional(),
  /** Placeholder text (used when displayAs='dropdown' or auto-switched to dropdown) */
  placeholder: z.string().optional(),
});

/** Confirm input request - boolean yes/no question */
const ConfirmInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('confirm'),
});

/** Number input request - numeric value with optional bounds */
const NumberInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('number'),
  /** Minimum allowed value */
  min: z.number().optional(),
  /** Maximum allowed value */
  max: z.number().optional(),
  /** Display format hint (step is derived: integer=1, decimal/currency/percentage=0.01) */
  format: z.enum(['integer', 'decimal', 'currency', 'percentage']).optional(),
}).refine((data) => data.min === undefined || data.max === undefined || data.min <= data.max, {
  message: 'min must be <= max',
});

/** Email input request - email address with optional domain restriction */
const EmailInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('email'),
  /** Restrict to specific domain (e.g., "company.com") */
  domain: z.string().optional(),
});

/** Date input request - date selection with optional range */
const DateInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('date'),
  /** Minimum date in ISO format (YYYY-MM-DD) */
  min: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  /** Maximum date in ISO format (YYYY-MM-DD) */
  max: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
}).refine(
  (data) =>
    data.min === undefined || data.max === undefined || new Date(data.min) <= new Date(data.max),
  { message: 'min date must be before or equal to max date' }
);

/** Rating input request - scale rating */
const RatingInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('rating'),
  /** Minimum rating value (UI defaults to 1 if not provided) */
  min: z.number().int().optional(),
  /** Maximum rating value (UI defaults to 5 if not provided) */
  max: z.number().int().optional(),
  /** Display style */
  style: z.enum(['stars', 'numbers', 'emoji']).optional(),
  /** Labels for scale endpoints */
  labels: z
    .object({
      low: z.string().optional(),
      high: z.string().optional(),
    })
    .optional(),
}).refine(
  (data) => {
    /** Only validate if both min and max are provided (they're optional) */
    if (data.min === undefined || data.max === undefined) return true;
    return data.min <= data.max && data.max - data.min <= 20;
  },
  { message: 'Rating scale must have min <= max and at most 20 items' }
);

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
  NumberInputSchema,
  EmailInputSchema,
  DateInputSchema,
  RatingInputSchema,
]);

export type InputRequest = z.infer<typeof InputRequestSchema>;

export type TextInputRequest = z.infer<typeof TextInputSchema>;
export type MultilineInputRequest = z.infer<typeof MultilineInputSchema>;
export type ChoiceInputRequest = z.infer<typeof ChoiceInputSchema>;
export type ConfirmInputRequest = z.infer<typeof ConfirmInputSchema>;
export type NumberInputRequest = z.infer<typeof NumberInputSchema>;
export type EmailInputRequest = z.infer<typeof EmailInputSchema>;
export type DateInputRequest = z.infer<typeof DateInputSchema>;
export type RatingInputRequest = z.infer<typeof RatingInputSchema>;

/**
 * @deprecated Use ChoiceInputRequest with displayAs='dropdown' instead.
 * Kept for backward compatibility - old dropdown requests are migrated to choice.
 */
export type DropdownInputRequest = ChoiceInputRequest;

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
  /** Required: available options for selection (supports both string[] and object[] formats) */
  options: ChoiceOption[];
  /** Enable multi-select (uses checkboxes instead of radio buttons) */
  multiSelect?: boolean;
  /** Override automatic UI selection (radio/checkbox vs dropdown) */
  displayAs?: 'radio' | 'checkbox' | 'dropdown';
  /** Placeholder text (used when displayAs='dropdown' or auto-switched to dropdown) */
  placeholder?: string;
}

/** Params for creating a confirm input request */
export interface CreateConfirmInputParams extends CreateInputRequestBaseParams {
  type: 'confirm';
}

/** Params for creating a number input request */
export interface CreateNumberInputParams extends CreateInputRequestBaseParams {
  type: 'number';
  min?: number;
  max?: number;
  /** Display format hint (step is derived: integer=1, decimal/currency/percentage=0.01) */
  format?: 'integer' | 'decimal' | 'currency' | 'percentage';
}

/** Params for creating an email input request */
export interface CreateEmailInputParams extends CreateInputRequestBaseParams {
  type: 'email';
  domain?: string;
}

/** Params for creating a date input request */
export interface CreateDateInputParams extends CreateInputRequestBaseParams {
  type: 'date';
  /** Minimum date in ISO format (YYYY-MM-DD) */
  min?: string;
  /** Maximum date in ISO format (YYYY-MM-DD) */
  max?: string;
}

/** Params for creating a rating input request */
export interface CreateRatingInputParams extends CreateInputRequestBaseParams {
  type: 'rating';
  min?: number;
  max?: number;
  style?: 'stars' | 'numbers' | 'emoji';
  labels?: { low?: string; high?: string };
}

/**
 * Parameters for creating a new input request.
 * Discriminated union ensures type-specific fields are required.
 */
export type CreateInputRequestParams =
  | CreateTextInputParams
  | CreateMultilineInputParams
  | CreateChoiceInputParams
  | CreateConfirmInputParams
  | CreateNumberInputParams
  | CreateEmailInputParams
  | CreateDateInputParams
  | CreateRatingInputParams;

/**
 * @deprecated Use CreateChoiceInputParams with displayAs='dropdown' instead.
 */
export interface CreateDropdownInputParams extends CreateInputRequestBaseParams {
  type: 'choice';
  options: ChoiceOption[];
  displayAs: 'dropdown';
  placeholder?: string;
}

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
        displayAs: params.displayAs,
        placeholder: params.placeholder,
      };
      break;
    case 'confirm':
      request = { ...baseFields, type: 'confirm' as const };
      break;
    case 'number':
      request = {
        ...baseFields,
        type: 'number' as const,
        min: params.min,
        max: params.max,
        format: params.format,
      };
      break;
    case 'email':
      request = {
        ...baseFields,
        type: 'email' as const,
        domain: params.domain,
      };
      break;
    case 'date':
      request = {
        ...baseFields,
        type: 'date' as const,
        min: params.min,
        max: params.max,
      };
      break;
    case 'rating':
      request = {
        ...baseFields,
        type: 'rating' as const,
        min: params.min,
        max: params.max,
        style: params.style,
        labels: params.labels,
      };
      break;
  }

  const parseResult = InputRequestSchema.safeParse(request);
  if (!parseResult.success) {
    throw new Error(`Invalid input request: ${parseResult.error.issues[0]?.message}`);
  }

  return parseResult.data;
}

/** Normalized choice option with guaranteed value and label */
export interface NormalizedChoiceOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
}

/**
 * Normalize choice options to objects for consistent rendering.
 * Handles both string[] (old format) and object[] (new format) for backward compatibility.
 *
 * @param options - Array of string or object options
 * @returns Array of normalized option objects with guaranteed value and label
 */
export function normalizeChoiceOptions(options: ChoiceOption[]): NormalizedChoiceOption[] {
  return options.map((opt) =>
    typeof opt === 'string'
      ? { value: opt, label: opt }
      : { ...opt, value: opt.value, label: opt.label || opt.value }
  );
}

/** Threshold for auto-switching from radio/checkbox to dropdown UI */
export const CHOICE_DROPDOWN_THRESHOLD = 9;

/**
 * ============================================================================
 * MULTI-QUESTION SUPPORT
 * ============================================================================
 */

/**
 * Maximum number of questions allowed in a multi-question request.
 * Technical limit is 10, but 8 is recommended for optimal UX.
 * All 8 input types can fit in one form without overwhelming users.
 */
export const MAX_QUESTIONS_PER_REQUEST = 10;

/**
 * Base schema for individual questions within a multi-question request.
 * Each question has its own message and type-specific configuration.
 */
const QuestionBaseSchema = z.object({
  /** Prompt message shown to the user for this question */
  message: z.string().min(1, 'Message cannot be empty'),
  /** Default value to pre-populate the input */
  defaultValue: z.string().optional(),
});

/** Text question - single line text entry */
const TextQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('text'),
});

/** Multiline question - multi-line text entry */
const MultilineQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('multiline'),
});

/** Choice question - select from predefined options */
const ChoiceQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('choice'),
  options: z.array(ChoiceOptionSchema).min(1, 'Choice questions must have at least one option'),
  multiSelect: z.boolean().optional(),
  displayAs: z.enum(['radio', 'checkbox', 'dropdown']).optional(),
  placeholder: z.string().optional(),
});

/** Confirm question - boolean yes/no */
const ConfirmQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('confirm'),
});

/** Number question - numeric value with optional bounds */
const NumberQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  format: z.enum(['integer', 'decimal', 'currency', 'percentage']).optional(),
}).refine((data) => data.min === undefined || data.max === undefined || data.min <= data.max, {
  message: 'min must be <= max',
});

/** Email question - email address with optional domain restriction */
const EmailQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('email'),
  domain: z.string().optional(),
});

/** Date question - date selection with optional range */
const DateQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('date'),
  min: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  max: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
}).refine(
  (data) =>
    data.min === undefined || data.max === undefined || new Date(data.min) <= new Date(data.max),
  { message: 'min date must be before or equal to max date' }
);

/** Rating question - scale rating */
const RatingQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('rating'),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  style: z.enum(['stars', 'numbers', 'emoji']).optional(),
  labels: z
    .object({
      low: z.string().optional(),
      high: z.string().optional(),
    })
    .optional(),
}).refine(
  (data) => {
    if (data.min === undefined || data.max === undefined) return true;
    return data.min <= data.max && data.max - data.min <= 20;
  },
  { message: 'Rating scale must have min <= max and at most 20 items' }
);

/**
 * Schema for an individual question in a multi-question request.
 * Uses discriminated union on 'type' field.
 */
export const QuestionSchema = z.discriminatedUnion('type', [
  TextQuestionSchema,
  MultilineQuestionSchema,
  ChoiceQuestionSchema,
  ConfirmQuestionSchema,
  NumberQuestionSchema,
  EmailQuestionSchema,
  DateQuestionSchema,
  RatingQuestionSchema,
]);

export type Question = z.infer<typeof QuestionSchema>;
export type TextQuestion = z.infer<typeof TextQuestionSchema>;
export type MultilineQuestion = z.infer<typeof MultilineQuestionSchema>;
export type ChoiceQuestion = z.infer<typeof ChoiceQuestionSchema>;
export type ConfirmQuestion = z.infer<typeof ConfirmQuestionSchema>;
export type NumberQuestion = z.infer<typeof NumberQuestionSchema>;
export type EmailQuestion = z.infer<typeof EmailQuestionSchema>;
export type DateQuestion = z.infer<typeof DateQuestionSchema>;
export type RatingQuestion = z.infer<typeof RatingQuestionSchema>;

/**
 * Multi-question input request schema.
 * Allows asking 1-10 questions in a single form submission (8 recommended for optimal UX).
 * Responses are stored as a record mapping question index to response value.
 */
export const MultiQuestionInputRequestSchema = z.object({
  /** Unique request ID */
  id: z.string(),
  /** When the request was created (Unix timestamp in ms) */
  createdAt: z.number(),
  /** Type discriminator for multi-question requests */
  type: z.literal('multi'),
  /** Array of questions (1-10, 8 recommended for UX) */
  questions: z
    .array(QuestionSchema)
    .min(1, 'At least one question is required')
    .max(
      MAX_QUESTIONS_PER_REQUEST,
      `Maximum ${MAX_QUESTIONS_PER_REQUEST} questions allowed (8 recommended for optimal UX)`
    ),
  /** Current status of the request */
  status: z.enum(InputRequestStatusValues),
  /** Timeout in seconds (0 = no timeout) */
  timeout: z
    .number()
    .int()
    .min(10, 'Timeout must be at least 10 seconds')
    .max(14400, 'Timeout cannot exceed 4 hours')
    .optional(),
  /** Optional plan ID to associate request with a specific plan */
  planId: z.string().optional(),
  /** User's responses keyed by question index ("0", "1", etc.) */
  responses: z.record(z.string(), z.unknown()).optional(),
  /** When the user answered (Unix timestamp in ms) */
  answeredAt: z.number().optional(),
  /** Who answered (username or "agent") */
  answeredBy: z.string().optional(),
});

export type MultiQuestionInputRequest = z.infer<typeof MultiQuestionInputRequestSchema>;

/**
 * Combined schema for any input request (single-question or multi-question).
 * Use this when you need to handle both types.
 */
export const AnyInputRequestSchema = z.union([InputRequestSchema, MultiQuestionInputRequestSchema]);

export type AnyInputRequest = z.infer<typeof AnyInputRequestSchema>;

/** Parameters for creating a multi-question input request */
export interface CreateMultiQuestionInputParams {
  questions: Question[];
  timeout?: number;
  planId?: string;
}

/**
 * Create a new multi-question input request with auto-generated fields.
 */
export function createMultiQuestionInputRequest(
  params: CreateMultiQuestionInputParams
): MultiQuestionInputRequest {
  const request = {
    id: nanoid(),
    createdAt: Date.now(),
    type: 'multi' as const,
    questions: params.questions,
    status: 'pending' as const,
    timeout: params.timeout,
    planId: params.planId,
  };

  const parseResult = MultiQuestionInputRequestSchema.safeParse(request);
  if (!parseResult.success) {
    throw new Error(
      `Invalid multi-question input request: ${parseResult.error.issues[0]?.message}`
    );
  }

  return parseResult.data;
}
