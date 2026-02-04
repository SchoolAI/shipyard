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

/**
 * Build a single input request object for the Loro document.
 * Supports text, multiline, choice, confirm, and number types.
 */
function buildSingleInputRequest(
  requestId: string,
  opts: SingleQuestionOptions,
  expiresAt: number
): InputRequestItem {
  const now = Date.now();
  const baseFields = {
    id: requestId,
    message: opts.message,
    status: 'pending' as const,
    createdAt: now,
    expiresAt,
    response: null,
    answeredAt: null,
    answeredBy: null,
    isBlocker: opts.isBlocker ?? null,
  };

  switch (opts.type) {
    case 'text':
      return {
        type: 'text' as const,
        ...baseFields,
        defaultValue: opts.defaultValue ?? null,
        placeholder: opts.placeholder ?? null,
      };
    case 'multiline':
      return {
        type: 'multiline' as const,
        ...baseFields,
        defaultValue: opts.defaultValue ?? null,
        placeholder: opts.placeholder ?? null,
      };
    case 'choice': {
      // Convert string[] options to the required { label, value, description } format
      const choiceOptions = (opts.options ?? []).map((opt) => ({
        label: opt,
        value: opt,
        description: null,
      }));
      return {
        type: 'choice' as const,
        ...baseFields,
        options: choiceOptions,
        multiSelect: opts.multiSelect ?? null,
        displayAs: (opts.displayAs ?? null) as 'radio' | 'checkbox' | 'dropdown' | null,
        placeholder: opts.placeholder ?? null,
      };
    }
    case 'confirm':
      return {
        type: 'confirm' as const,
        ...baseFields,
      };
    case 'number':
      return {
        type: 'number' as const,
        ...baseFields,
        min: opts.min ?? null,
        max: opts.max ?? null,
        format: (opts.format ?? null) as 'integer' | 'decimal' | 'currency' | 'percentage' | null,
        defaultValue: opts.defaultValue !== undefined ? Number.parseFloat(opts.defaultValue) : null,
      };
    default:
      // For unsupported types (email, date, rating), fall back to text
      return {
        type: 'text' as const,
        ...baseFields,
        defaultValue: opts.defaultValue ?? null,
        placeholder: opts.placeholder ?? null,
      };
  }
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
  const now = Date.now();

  // Convert questions to the schema format
  const formattedQuestions = questions.map((q) => {
    const base = {
      type: q.type,
      message: q.message,
    };

    switch (q.type) {
      case 'text':
      case 'multiline':
        return {
          ...base,
          defaultValue: q.defaultValue ?? null,
          placeholder: null,
        };
      case 'choice': {
        const choiceOptions = (q.options ?? []).map((opt) => ({
          label: opt,
          value: opt,
          description: null,
        }));
        return {
          ...base,
          options: choiceOptions,
          multiSelect: q.multiSelect ?? null,
          displayAs: q.displayAs ?? null,
          placeholder: null,
        };
      }
      case 'confirm':
        return base;
      case 'number':
        return {
          ...base,
          min: q.min ?? null,
          max: q.max ?? null,
          format: q.format ?? null,
          defaultValue: q.defaultValue !== undefined ? Number.parseFloat(q.defaultValue) : null,
        };
      default:
        // For unsupported types, fall back to text
        return {
          ...base,
          type: 'text',
          defaultValue: q.defaultValue ?? null,
          placeholder: null,
        };
    }
  });

  return {
    type: 'multi' as const,
    id: requestId,
    message: questions[0]?.message ?? 'Multiple questions',
    status: 'pending' as const,
    createdAt: now,
    expiresAt,
    response: null,
    answeredAt: null,
    answeredBy: null,
    isBlocker: opts.isBlocker ?? null,
    questions: formattedQuestions,
    responses: {},
  } as InputRequestItem;
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

  const timeoutSeconds = Math.max(
    MIN_TIMEOUT_SECONDS,
    Math.min(opts.timeout ?? DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS)
  );
  const expiresAt = Date.now() + timeoutSeconds * 1000;

  logger.info({ requestId, taskId: opts.taskId, timeoutSeconds }, 'Creating input request');

  // Get the task document
  const taskDoc = getTaskDocument(opts.taskId);

  if ('questions' in opts) {
    // Multi-question mode
    const questions = opts.questions.filter((q): q is NonNullable<typeof q> => q != null);

    if (questions.length === 0) {
      return {
        success: false,
        status: 'cancelled',
        reason: 'No valid questions provided',
      };
    }

    // Write multi-question request to Loro
    const inputRequest = buildMultiInputRequest(requestId, questions, opts, expiresAt);
    taskDoc.inputRequests.push(inputRequest);
    taskDoc.syncPendingRequestsToRoom();

    // Log event for inbox notification
    taskDoc.logEvent(
      'input_request_created',
      'agent',
      {
        requestId,
        message: inputRequest.message as string,
        isBlocker: opts.isBlocker ?? null,
      },
      { inboxWorthy: true, inboxFor: taskDoc.meta.ownerId ?? undefined }
    );

    logger.info(
      { requestId, questionCount: questions.length },
      'Multi-question input request created (waiting for response)'
    );
  } else {
    // Single question mode
    const inputRequest = buildSingleInputRequest(requestId, opts, expiresAt);
    taskDoc.inputRequests.push(inputRequest);
    taskDoc.syncPendingRequestsToRoom();

    // Log event for inbox notification
    taskDoc.logEvent(
      'input_request_created',
      'agent',
      {
        requestId,
        message: opts.message,
        isBlocker: opts.isBlocker ?? null,
      },
      { inboxWorthy: true, inboxFor: taskDoc.meta.ownerId ?? undefined }
    );

    logger.info(
      { requestId, type: opts.type, message: opts.message },
      'Single-question input request created (waiting for response)'
    );
  }

  // Poll for response
  const pollInterval = 1000;
  const startTime = Date.now();

  while (Date.now() < expiresAt) {
    // Read from taskDoc.inputRequests to check for response
    const requests = taskDoc.inputRequests.toJSON();
    const request = requests.find((r: { id: string }) => r.id === requestId) as
      | { id: string; status: string; response: unknown; responses?: unknown }
      | undefined;

    if (!request) {
      logger.warn({ requestId }, 'Input request not found in document');
      return {
        success: false,
        status: 'cancelled',
        reason: 'Request was deleted or not found',
      };
    }

    // Check if answered
    if (request.status === 'answered' && request.response != null) {
      logger.info({ requestId, response: request.response }, 'Input request answered');
      return {
        success: true,
        response: request.response as string | Record<string, string>,
        status: 'answered',
      };
    }

    // Check for multi-question responses
    if (
      request.status === 'answered' &&
      request.responses &&
      typeof request.responses === 'object'
    ) {
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

    // Check if declined
    if (request.status === 'declined') {
      logger.info({ requestId }, 'Input request declined');
      return {
        success: false,
        status: 'declined',
        reason: 'User declined to answer',
      };
    }

    // Check if cancelled
    if (request.status === 'cancelled') {
      logger.info({ requestId }, 'Input request cancelled');
      return {
        success: false,
        status: 'cancelled',
        reason: 'Request was cancelled',
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed % 30 === 0 && elapsed > 0) {
      logger.debug({ requestId, elapsedSeconds: elapsed }, 'Still waiting for input response');
    }
  }

  // Timeout reached - cancel the request
  logger.warn({ requestId }, 'Input request timed out');

  // Update request status to cancelled in the document
  const requests = taskDoc.inputRequests.toJSON();
  const idx = requests.findIndex((r: { id: string }) => r.id === requestId);
  if (idx !== -1) {
    const req = taskDoc.inputRequests.get(idx);
    if (req) {
      req.status = 'cancelled';
    }
    taskDoc.syncPendingRequestsToRoom();
    taskDoc.logEvent('input_request_cancelled', 'agent', { requestId });
  }

  return {
    success: false,
    status: 'cancelled',
    reason: `Request timed out after ${timeoutSeconds} seconds. The user did not respond in time.`,
  };
}
