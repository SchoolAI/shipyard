/**
 * User input request for sandbox.
 *
 * Requests input from user via browser modal, blocking until response.
 * Ported from apps/server-legacy/src/tools/execute-code.ts requestUserInput.
 */

import {
  generateInputRequestId,
  RoomSchema,
  TaskDocument,
  TaskDocumentSchema,
  type TaskInputRequest,
  toTaskId,
} from '@shipyard/loro-schema';
import { getRepo } from '../../loro/repo.js';
import { logger } from '../../utils/logger.js';

/** Well-known room document ID */
const ROOM_DOC_ID = 'room';

/** Default timeout for input requests (30 minutes) */
const DEFAULT_TIMEOUT_SECONDS = 1800;

/** Minimum timeout (5 minutes) */
const MIN_TIMEOUT_SECONDS = 300;

/** Maximum timeout (4 hours) */
const MAX_TIMEOUT_SECONDS = 14400;

/**
 * Question type for multi-question mode.
 */
export interface Question {
  type: 'text' | 'multiline' | 'choice' | 'confirm' | 'number' | 'email' | 'date' | 'rating';
  message: string;
  options?: string[];
  multiSelect?: boolean;
  displayAs?: 'radio' | 'checkbox' | 'dropdown';
  defaultValue?: string;
  min?: number;
  max?: number;
  format?: 'integer' | 'decimal' | 'currency' | 'percentage';
  minDate?: string;
  maxDate?: string;
  domain?: string;
  style?: 'stars' | 'numbers' | 'emoji';
  labels?: { low?: string; high?: string };
}

/**
 * Single question input options.
 */
export interface SingleQuestionOptions {
  /** Required: The task ID to associate the input request with */
  taskId: string;
  message: string;
  type: 'text' | 'multiline' | 'choice' | 'confirm' | 'number' | 'email' | 'date' | 'rating';
  options?: string[];
  multiSelect?: boolean;
  displayAs?: 'radio' | 'checkbox' | 'dropdown';
  defaultValue?: string;
  timeout?: number;
  isBlocker?: boolean;
  min?: number;
  max?: number;
  format?: 'integer' | 'decimal' | 'currency' | 'percentage';
  minDate?: string;
  maxDate?: string;
  domain?: string;
  style?: 'stars' | 'numbers' | 'emoji';
  labels?: { low?: string; high?: string };
  placeholder?: string;
}

/**
 * Multi-question input options.
 */
export interface MultiQuestionOptions {
  /** Required: The task ID to associate the input request with */
  taskId: string;
  questions: Question[];
  timeout?: number;
  isBlocker?: boolean;
}

/**
 * Input request result.
 */
export interface InputRequestResult {
  success: boolean;
  response?: string | Record<string, string>;
  status: 'answered' | 'declined' | 'cancelled';
  reason?: string;
}

/**
 * Get or create a TaskDocument for a given task ID.
 */
function getTaskDocument(taskId: string): TaskDocument {
  const repo = getRepo();
  const taskHandle = repo.get(taskId, TaskDocumentSchema);
  const roomHandle = repo.get(ROOM_DOC_ID, RoomSchema);
  return new TaskDocument(taskHandle.doc, roomHandle.doc, toTaskId(taskId));
}

/** Type alias for a single input request item */
type InputRequestItem = TaskInputRequest[number];

/** Base fields for all input request types */
interface BaseInputRequestFields {
  id: string;
  message: string;
  status: 'pending';
  createdAt: number;
  expiresAt: number;
  response: null;
  answeredAt: null;
  answeredBy: null;
  isBlocker: boolean | null;
}

/** Create base fields common to all input request types */
function createBaseFields(
  requestId: string,
  message: string,
  expiresAt: number,
  isBlocker?: boolean
): BaseInputRequestFields {
  return {
    id: requestId,
    message,
    status: 'pending' as const,
    createdAt: Date.now(),
    expiresAt,
    response: null,
    answeredAt: null,
    answeredBy: null,
    isBlocker: isBlocker ?? null,
  };
}

/** Build a text-type input request */
function buildTextRequest(
  baseFields: BaseInputRequestFields,
  defaultValue?: string,
  placeholder?: string
): InputRequestItem {
  return {
    type: 'text' as const,
    ...baseFields,
    defaultValue: defaultValue ?? null,
    placeholder: placeholder ?? null,
  };
}

/** Build a multiline-type input request */
function buildMultilineRequest(
  baseFields: BaseInputRequestFields,
  defaultValue?: string,
  placeholder?: string
): InputRequestItem {
  return {
    type: 'multiline' as const,
    ...baseFields,
    defaultValue: defaultValue ?? null,
    placeholder: placeholder ?? null,
  };
}

/** Convert string options to choice option format */
function convertToChoiceOptions(options: string[]) {
  return options.map((opt) => ({
    label: opt,
    value: opt,
    description: null,
  }));
}

/** Build a choice-type input request */
function buildChoiceRequest(
  baseFields: BaseInputRequestFields,
  opts: Pick<SingleQuestionOptions, 'options' | 'multiSelect' | 'displayAs' | 'placeholder'>
): InputRequestItem {
  return {
    type: 'choice' as const,
    ...baseFields,
    options: convertToChoiceOptions(opts.options ?? []),
    multiSelect: opts.multiSelect ?? null,
    displayAs: (opts.displayAs ?? null) as 'radio' | 'checkbox' | 'dropdown' | null,
    placeholder: opts.placeholder ?? null,
  };
}

/** Build a confirm-type input request */
function buildConfirmRequest(baseFields: BaseInputRequestFields): InputRequestItem {
  return {
    type: 'confirm' as const,
    ...baseFields,
  };
}

/** Build a number-type input request */
function buildNumberRequest(
  baseFields: BaseInputRequestFields,
  opts: Pick<SingleQuestionOptions, 'min' | 'max' | 'format' | 'defaultValue'>
): InputRequestItem {
  return {
    type: 'number' as const,
    ...baseFields,
    min: opts.min ?? null,
    max: opts.max ?? null,
    format: (opts.format ?? null) as 'integer' | 'decimal' | 'currency' | 'percentage' | null,
    defaultValue: opts.defaultValue !== undefined ? Number.parseFloat(opts.defaultValue) : null,
  };
}

/**
 * Build a single input request object for the Loro document.
 * Supports text, multiline, choice, confirm, and number types.
 */
function buildSingleInputRequest(
  requestId: string,
  opts: SingleQuestionOptions,
  expiresAt: number
): InputRequestItem {
  const baseFields = createBaseFields(requestId, opts.message, expiresAt, opts.isBlocker);

  if (opts.type === 'text') {
    return buildTextRequest(baseFields, opts.defaultValue, opts.placeholder);
  }
  if (opts.type === 'multiline') {
    return buildMultilineRequest(baseFields, opts.defaultValue, opts.placeholder);
  }
  if (opts.type === 'choice') {
    return buildChoiceRequest(baseFields, opts);
  }
  if (opts.type === 'confirm') {
    return buildConfirmRequest(baseFields);
  }
  if (opts.type === 'number') {
    return buildNumberRequest(baseFields, opts);
  }
  // For unsupported types (email, date, rating), fall back to text
  return buildTextRequest(baseFields, opts.defaultValue, opts.placeholder);
}

/** Format a single question for multi-question request */
function formatQuestion(q: Question) {
  const base = {
    type: q.type,
    message: q.message,
  };

  if (q.type === 'text' || q.type === 'multiline') {
    return { ...base, defaultValue: q.defaultValue ?? null, placeholder: null };
  }
  if (q.type === 'choice') {
    return {
      ...base,
      options: convertToChoiceOptions(q.options ?? []),
      multiSelect: q.multiSelect ?? null,
      displayAs: q.displayAs ?? null,
      placeholder: null,
    };
  }
  if (q.type === 'confirm') {
    return base;
  }
  if (q.type === 'number') {
    return {
      ...base,
      min: q.min ?? null,
      max: q.max ?? null,
      format: q.format ?? null,
      defaultValue: q.defaultValue !== undefined ? Number.parseFloat(q.defaultValue) : null,
    };
  }
  // For unsupported types, fall back to text
  return { ...base, type: 'text', defaultValue: q.defaultValue ?? null, placeholder: null };
}

/**
 * Build a multi-question input request object for the Loro document.
 */
function buildMultiInputRequest(
  requestId: string,
  questions: Question[],
  opts: MultiQuestionOptions,
  expiresAt: number
): InputRequestItem {
  return {
    type: 'multi' as const,
    id: requestId,
    message: questions[0]?.message ?? 'Multiple questions',
    status: 'pending' as const,
    createdAt: Date.now(),
    expiresAt,
    response: null,
    answeredAt: null,
    answeredBy: null,
    isBlocker: opts.isBlocker ?? null,
    questions: questions.map(formatQuestion),
    responses: {},
  } as InputRequestItem;
}

/** Calculate timeout in seconds, clamped to min/max bounds */
function calculateTimeoutSeconds(timeout?: number): number {
  return Math.max(
    MIN_TIMEOUT_SECONDS,
    Math.min(timeout ?? DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS)
  );
}

/** Type for request status check */
interface PendingRequest {
  id: string;
  status: string;
  response: unknown;
  responses?: unknown;
}

/** Check request status and return result if complete, or null to continue polling */
function checkRequestStatus(
  request: PendingRequest | undefined,
  requestId: string
): InputRequestResult | null {
  if (!request) {
    logger.warn({ requestId }, 'Input request not found in document');
    return { success: false, status: 'cancelled', reason: 'Request was deleted or not found' };
  }

  if (request.status === 'answered' && request.response != null) {
    logger.info({ requestId, response: request.response }, 'Input request answered');
    return {
      success: true,
      response: request.response as string | Record<string, string>,
      status: 'answered',
    };
  }

  if (request.status === 'answered' && request.responses && typeof request.responses === 'object') {
    logger.info(
      { requestId, responses: request.responses },
      'Multi-question input request answered'
    );
    return {
      success: true,
      response: request.responses as Record<string, string>,
      status: 'answered',
    };
  }

  if (request.status === 'declined') {
    logger.info({ requestId }, 'Input request declined');
    return { success: false, status: 'declined', reason: 'User declined to answer' };
  }

  if (request.status === 'cancelled') {
    logger.info({ requestId }, 'Input request cancelled');
    return { success: false, status: 'cancelled', reason: 'Request was cancelled' };
  }

  return null; // Continue polling
}

/** Cancel a request due to timeout */
function cancelRequestOnTimeout(taskDoc: TaskDocument, requestId: string): void {
  const requests = taskDoc.inputRequests.toJSON();
  const idx = requests.findIndex((r: { id: string }) => r.id === requestId);
  if (idx === -1) {
    return;
  }
  const req = taskDoc.inputRequests.get(idx);
  if (req) {
    req.status = 'cancelled';
  }
  taskDoc.syncPendingRequestsToRoom();
  taskDoc.logEvent('input_request_cancelled', 'agent', { requestId });
}

/** Store input request in task document and log event */
function storeInputRequest(
  taskDoc: TaskDocument,
  inputRequest: InputRequestItem,
  requestId: string,
  message: string,
  isBlocker?: boolean
): void {
  taskDoc.inputRequests.push(inputRequest);
  taskDoc.syncPendingRequestsToRoom();
  taskDoc.logEvent(
    'input_request_created',
    'agent',
    { requestId, message, isBlocker: isBlocker ?? null },
    { inboxWorthy: true, inboxFor: taskDoc.meta.ownerId ?? undefined }
  );
}

/** Create and store a multi-question input request. Returns null on success, or error result. */
function createMultiQuestionRequest(
  taskDoc: TaskDocument,
  opts: MultiQuestionOptions,
  requestId: string,
  expiresAt: number
): InputRequestResult | null {
  const questions = opts.questions.filter((q): q is NonNullable<typeof q> => q != null);

  if (questions.length === 0) {
    return { success: false, status: 'cancelled', reason: 'No valid questions provided' };
  }

  const inputRequest = buildMultiInputRequest(requestId, questions, opts, expiresAt);
  storeInputRequest(
    taskDoc,
    inputRequest,
    requestId,
    inputRequest.message as string,
    opts.isBlocker
  );
  logger.info(
    { requestId, questionCount: questions.length },
    'Multi-question input request created (waiting for response)'
  );
  return null;
}

/** Create and store a single-question input request */
function createSingleQuestionRequest(
  taskDoc: TaskDocument,
  opts: SingleQuestionOptions,
  requestId: string,
  expiresAt: number
): void {
  const inputRequest = buildSingleInputRequest(requestId, opts, expiresAt);
  storeInputRequest(taskDoc, inputRequest, requestId, opts.message, opts.isBlocker);
  logger.info(
    { requestId, type: opts.type, message: opts.message },
    'Single-question input request created (waiting for response)'
  );
}

/** Poll for response until timeout or completion */
async function pollForResponse(
  taskDoc: TaskDocument,
  requestId: string,
  expiresAt: number,
  timeoutSeconds: number
): Promise<InputRequestResult> {
  const pollInterval = 1000;
  const startTime = Date.now();

  while (Date.now() < expiresAt) {
    const requests = taskDoc.inputRequests.toJSON();
    const request = requests.find((r: { id: string }) => r.id === requestId) as
      | PendingRequest
      | undefined;

    const result = checkRequestStatus(request, requestId);
    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed % 30 === 0 && elapsed > 0) {
      logger.debug({ requestId, elapsedSeconds: elapsed }, 'Still waiting for input response');
    }
  }

  logger.warn({ requestId }, 'Input request timed out');
  cancelRequestOnTimeout(taskDoc, requestId);

  return {
    success: false,
    status: 'cancelled',
    reason: `Request timed out after ${timeoutSeconds} seconds. The user did not respond in time.`,
  };
}

/**
 * Request user input via browser modal.
 * Supports single-question and multi-question modes.
 *
 * NOTE: This is a simplified implementation that stores the request in the
 * Loro document and polls for a response. A full implementation would use
 * Loro subscriptions for real-time updates.
 */
export async function requestUserInput(
  opts: SingleQuestionOptions | MultiQuestionOptions
): Promise<InputRequestResult> {
  const requestId = generateInputRequestId();
  const timeoutSeconds = calculateTimeoutSeconds(opts.timeout);
  const expiresAt = Date.now() + timeoutSeconds * 1000;

  logger.info({ requestId, taskId: opts.taskId, timeoutSeconds }, 'Creating input request');

  const taskDoc = getTaskDocument(opts.taskId);

  if ('questions' in opts) {
    const error = createMultiQuestionRequest(taskDoc, opts, requestId, expiresAt);
    if (error) {
      return error;
    }
  } else {
    createSingleQuestionRequest(taskDoc, opts, requestId, expiresAt);
  }

  return pollForResponse(taskDoc, requestId, expiresAt, timeoutSeconds);
}
