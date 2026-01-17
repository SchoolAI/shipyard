import { nanoid } from 'nanoid';
import { z } from 'zod';

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
 * - cancelled: Request cancelled (timeout or explicit cancellation)
 */
export const InputRequestStatusValues = ['pending', 'answered', 'cancelled'] as const;
export type InputRequestStatus = (typeof InputRequestStatusValues)[number];

/**
 * Schema for an input request stored in Y.Doc.
 * Follows CRDT patterns from existing Peer-Plan schemas.
 */
export const InputRequestSchema = z.object({
  /** Unique request ID */
  id: z.string(),
  /** When the request was created (Unix timestamp in ms) */
  createdAt: z.number(),
  /** Prompt message shown to the user */
  message: z.string().min(1, 'Message cannot be empty'),
  /** Type of input being requested */
  type: z.enum(InputRequestTypeValues),
  /** Available options (required for 'choice' type) */
  options: z.array(z.string()).optional(),
  /** Default value to pre-populate the input */
  defaultValue: z.string().optional(),
  /** Current status of the request */
  status: z.enum(InputRequestStatusValues),
  /** User's response (any JSON-serializable value) */
  response: z.unknown().optional(),
  /** When the user answered (Unix timestamp in ms) */
  answeredAt: z.number().optional(),
  /** Who answered (username or "agent") */
  answeredBy: z.string().optional(),
  /** Timeout in seconds (0 = no timeout) */
  timeout: z
    .number()
    .int()
    .min(10, 'Timeout must be at least 10 seconds')
    .max(600, 'Timeout cannot exceed 10 minutes')
    .optional(),
});

export type InputRequest = z.infer<typeof InputRequestSchema>;

/**
 * Parameters for creating a new input request.
 * Omits fields that are auto-generated (id, createdAt, status).
 */
export interface CreateInputRequestParams {
  message: string;
  type: InputRequestType;
  options?: string[];
  defaultValue?: string;
  timeout?: number;
}

/**
 * Create a new input request with auto-generated fields.
 * Sets id, createdAt, and status to initial values.
 *
 * @param params - Request parameters
 * @returns Complete InputRequest ready to store in Y.Doc
 */
export function createInputRequest(params: CreateInputRequestParams): InputRequest {
  // Validate that 'choice' type includes options
  if (params.type === 'choice' && (!params.options || params.options.length === 0)) {
    throw new Error("Input requests of type 'choice' must include at least one option");
  }

  const request = {
    id: nanoid(),
    createdAt: Date.now(),
    message: params.message,
    type: params.type,
    options: params.options,
    defaultValue: params.defaultValue,
    status: 'pending' as const,
    timeout: params.timeout,
  };

  // Validate the complete request against the schema
  // This ensures message is not empty and timeout is within valid range
  const parseResult = InputRequestSchema.safeParse(request);
  if (!parseResult.success) {
    throw new Error(`Invalid input request: ${parseResult.error.issues[0]?.message}`);
  }

  return parseResult.data;
}
