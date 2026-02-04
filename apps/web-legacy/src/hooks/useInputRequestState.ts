/**
 * Hook to manage InputRequestModal state including value, countdown, and form submission.
 * Handles auto-cancellation on timeout and reset when request changes.
 */

import {
  type AnswerInputRequestResult,
  answerInputRequest,
  assertNever,
  cancelInputRequest,
  DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS,
  declineInputRequest,
  type InputRequest,
} from '@shipyard/schema';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';

/** Return type for the useInputRequestState hook */
export interface UseInputRequestStateReturn {
  /** Current input value (string for single-select, string[] for multi-select) */
  value: string | string[];
  /** Set the input value */
  setValue: React.Dispatch<React.SetStateAction<string | string[]>>;
  /** Whether form submission is in progress */
  isSubmitting: boolean;
  /** Remaining time before timeout (-1 if not initialized) */
  remainingTime: number;
  /** Cancel the request (called on timeout) */
  handleCancel: () => void;
  /** Decline the request (user clicked "Decline") */
  handleDecline: () => void;
  /** Submit the answer */
  handleSubmit: (responseValue: string, username: string) => void;
  /** Handle confirm type response (yes/no) */
  handleConfirmResponse: (response: 'yes' | 'no', username: string) => void;
  /** Format seconds as mm:ss string */
  formatTime: (seconds: number) => string;
}

/**
 * Handle answer errors with exhaustive checking.
 * Returns true if error was handled (toast shown).
 */
function handleAnswerError(result: Extract<AnswerInputRequestResult, { success: false }>): void {
  const { error } = result;
  switch (error) {
    case 'Request already answered': {
      const answeredBy = 'answeredBy' in result ? result.answeredBy : undefined;
      const byWhom = answeredBy ? ` by ${answeredBy}` : '';
      toast.error(`This request was already answered${byWhom}`);
      break;
    }
    case 'Request not found':
      toast.error('This request could not be found');
      break;
    case 'Request was declined':
      toast.error('This request was declined');
      break;
    case 'Request was cancelled':
      toast.error('This request timed out or was cancelled');
      break;
    case 'Request is not pending':
      toast.error('This request is no longer pending');
      break;
    default:
      assertNever(error);
  }
}

/**
 * Get initial value based on request type.
 */
function getInitialValue(request: InputRequest | null): string | string[] {
  if (!request) return '';
  if (request.type === 'choice' && request.multiSelect) {
    return request.defaultValue ? [request.defaultValue] : [];
  }
  return request.defaultValue || '';
}

/**
 * Format seconds as mm:ss.
 */
function formatTime(seconds: number): string {
  if (seconds < 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Hook to manage all state for the InputRequestModal.
 * Handles value state, countdown timer, auto-cancellation, and form submission.
 */
export function useInputRequestState(
  request: InputRequest | null,
  ydoc: Y.Doc | null,
  isOpen: boolean,
  onClose: () => void
): UseInputRequestStateReturn {
  const [value, setValue] = useState<string | string[]>(() => getInitialValue(request));
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** -1 is sentinel value meaning "not yet initialized" */
  const [remainingTime, setRemainingTime] = useState(-1);

  /** Reset state when request changes */
  useEffect(() => {
    if (request) {
      setValue(getInitialValue(request));
    }
    /** Reset countdown to sentinel value when request changes */
    setRemainingTime(-1);
  }, [request]);

  /** Used for auto-timeout - sets status to 'cancelled' */
  const handleCancel = useCallback(() => {
    if (!ydoc || !request) return;

    const result = cancelInputRequest(ydoc, request.id);
    if (!result.success) return;

    setValue(getInitialValue(request));
    onClose();
  }, [ydoc, request, onClose]);

  /** Used when user explicitly clicks "Decline" */
  const handleDecline = useCallback(() => {
    if (!ydoc || !request) return;

    const result = declineInputRequest(ydoc, request.id);
    if (!result.success) return;

    setValue(getInitialValue(request));
    onClose();
  }, [ydoc, request, onClose]);

  /** Countdown timer - calculate from createdAt */
  useEffect(() => {
    if (!request || !isOpen) return;

    const timeout = request.timeout || DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS;
    const elapsed = Math.floor((Date.now() - request.createdAt) / 1000);
    const remaining = Math.max(0, timeout - elapsed);

    setRemainingTime(remaining);

    const interval = setInterval(() => {
      const newElapsed = Math.floor((Date.now() - request.createdAt) / 1000);
      const newRemaining = Math.max(0, timeout - newElapsed);
      setRemainingTime(newRemaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [request, isOpen]);

  /** Auto-cancel on timeout (remainingTime === 0, not < 0) */
  useEffect(() => {
    if (remainingTime === 0 && isOpen && request) {
      handleCancel();
    }
  }, [remainingTime, isOpen, request, handleCancel]);

  const handleSubmit = useCallback(
    (responseValue: string, username: string) => {
      if (!ydoc || !request || isSubmitting) return;

      setIsSubmitting(true);

      try {
        const result = answerInputRequest(ydoc, request.id, responseValue, username);

        if (!result.success) {
          handleAnswerError(result);
          onClose();
          return;
        }

        setValue(getInitialValue(request));
        onClose();
      } finally {
        setIsSubmitting(false);
      }
    },
    [ydoc, request, isSubmitting, onClose]
  );

  const handleConfirmResponse = useCallback(
    (response: 'yes' | 'no', username: string) => {
      if (!ydoc || !request || isSubmitting) return;

      setIsSubmitting(true);

      try {
        const result = answerInputRequest(ydoc, request.id, response, username);

        if (!result.success) {
          handleAnswerError(result);
          onClose();
          return;
        }

        setValue(getInitialValue(request));
        onClose();
      } finally {
        setIsSubmitting(false);
      }
    },
    [ydoc, request, isSubmitting, onClose]
  );

  return {
    value,
    setValue,
    isSubmitting,
    remainingTime,
    handleCancel,
    handleDecline,
    handleSubmit,
    handleConfirmResponse,
    formatTime,
  };
}
