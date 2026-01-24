/**
 * Modal component for responding to agent input requests.
 * Displays different input types (text, multiline, choice, confirm) with countdown timer.
 * Updates Y.Doc with user response or cancellation.
 */

import { Alert, Button, Card, Form, Modal } from '@heroui/react';
import {
  type AnswerInputRequestResult,
  answerInputRequest,
  assertNever,
  cancelInputRequest,
  DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS,
  declineInputRequest,
  type InputRequest,
} from '@shipyard/schema';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import {
  ChoiceInput,
  ConfirmInput,
  DateInput,
  DropdownInput,
  EmailInput,
  formatTime,
  MultilineInput,
  NumberInput,
  OTHER_OPTION_VALUE,
  RatingInput,
  TextInput,
} from './inputs';

interface InputRequestModalProps {
  isOpen: boolean;
  request: InputRequest | null;
  ydoc: Y.Doc | null;
  onClose: () => void;
}

/** Basic email validation regex */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate input value based on request type.
 * Returns true if input is valid, false otherwise.
 * Used to disable submit button when validation fails.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Validation logic for multiple input types needs conditional checks
function isInputValid(request: InputRequest | null, value: string | string[]): boolean {
  if (!request) return true;

  switch (request.type) {
    case 'number': {
      const numStr = typeof value === 'string' ? value : '';
      if (!numStr) return true; // Empty is handled by required check
      const num = Number.parseFloat(numStr);
      if (Number.isNaN(num)) return false;
      if (request.min !== undefined && num < request.min) return false;
      if (request.max !== undefined && num > request.max) return false;
      return true;
    }
    case 'email': {
      const email = typeof value === 'string' ? value : '';
      if (!email.trim()) return true; // Empty is handled by required check
      if (!EMAIL_REGEX.test(email)) return false;
      if (request.domain && !email.toLowerCase().endsWith(`@${request.domain.toLowerCase()}`)) {
        return false;
      }
      return true;
    }
    case 'date': {
      const dateStr = typeof value === 'string' ? value : '';
      if (!dateStr) return true; // Empty is handled by required check
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateStr)) return false;
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) return false;
      if (request.min) {
        const minDate = new Date(request.min);
        if (date < minDate) return false;
      }
      if (request.max) {
        const maxDate = new Date(request.max);
        if (date > maxDate) return false;
      }
      return true;
    }
    default:
      return true;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Modal handles multiple input types with complex state management
export function InputRequestModal({ isOpen, request, ydoc, onClose }: InputRequestModalProps) {
  const [value, setValue] = useState<string | string[]>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Use -1 as sentinel value to indicate "not yet initialized"
  // This prevents race condition where auto-cancel fires before countdown is set
  const [remainingTime, setRemainingTime] = useState(-1);
  // Custom input for "Other" option in choice-type questions
  const [customInput, setCustomInput] = useState('');
  const { identity, startAuth } = useGitHubAuth();

  // Derive whether "Other" is selected for choice-type questions
  const isOtherSelected =
    request?.type === 'choice' &&
    (Array.isArray(value) ? value.includes(OTHER_OPTION_VALUE) : value === OTHER_OPTION_VALUE);

  // Reset state when request changes
  useEffect(() => {
    if (request) {
      // multiSelect only exists on 'choice' type requests
      if (request.type === 'choice' && request.multiSelect) {
        setValue(request.defaultValue ? [request.defaultValue] : []);
      } else {
        setValue(request.defaultValue || '');
      }
      // Reset custom input when request changes
      setCustomInput('');
    }
    // Reset countdown to sentinel value when request changes
    // This prevents stale timeout values from previous requests
    setRemainingTime(-1);
  }, [request]);

  // Used for auto-timeout - sets status to 'cancelled'
  const handleCancel = useCallback(() => {
    if (!ydoc || !request) return;

    const result = cancelInputRequest(ydoc, request.id);
    if (!result.success) {
      return;
    }

    // multiSelect only exists on 'choice' type requests
    setValue(request.type === 'choice' && request.multiSelect ? [] : '');
    onClose();
  }, [ydoc, request, onClose]);

  // Used when user explicitly clicks "Decline" - sets status to 'declined'
  const handleDecline = useCallback(() => {
    if (!ydoc || !request) return;

    const result = declineInputRequest(ydoc, request.id);
    if (!result.success) {
      return;
    }

    // multiSelect only exists on 'choice' type requests
    setValue(request.type === 'choice' && request.multiSelect ? [] : '');
    onClose();
  }, [ydoc, request, onClose]);

  const handleModalClose = useCallback(() => {
    // Only close modal, don't cancel request
    // User must explicitly click Cancel button or let timeout expire
    onClose();
  }, [onClose]);

  // Countdown timer - calculate from createdAt
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

  // Auto-cancel on timeout
  // Note: Uses remainingTime === 0 (not < 0) to skip initial state (-1)
  // This prevents race condition where auto-cancel fires before countdown timer sets actual value
  useEffect(() => {
    if (remainingTime === 0 && isOpen && request) {
      handleCancel();
    }
  }, [remainingTime, isOpen, request, handleCancel]);

  /** Handle answer errors with exhaustive checking. Always closes modal after error. */
  const handleAnswerError = useCallback(
    (result: Extract<AnswerInputRequestResult, { success: false }>, onCloseFn: () => void) => {
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
      onCloseFn();
    },
    []
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Submit handler has conditional logic for "Other" option and multi-select
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ydoc || !request || !identity || isSubmitting) return;

    setIsSubmitting(true);

    try {
      let responseValue: string;

      // Handle "Other" option for choice-type questions
      if (request.type === 'choice' && isOtherSelected) {
        if (Array.isArray(value)) {
          // Multi-select: combine selected options (excluding __other__) with custom input
          const selectedOptions = value.filter((v) => v !== OTHER_OPTION_VALUE);
          responseValue = [...selectedOptions, customInput.trim()].join(', ');
        } else {
          // Single-select: use custom input as the response
          responseValue = customInput.trim();
        }
      } else {
        // Standard handling: convert array values to comma-separated string
        responseValue = Array.isArray(value) ? value.join(', ') : value;
      }

      const result = answerInputRequest(ydoc, request.id, responseValue, identity.username);

      if (!result.success) {
        handleAnswerError(result, onClose);
        return;
      }

      // Success - close modal and clear state
      // multiSelect only exists on 'choice' type requests
      setValue(request.type === 'choice' && request.multiSelect ? [] : '');
      setCustomInput('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmResponse = useCallback(
    (response: 'yes' | 'no') => {
      if (!ydoc || !request || !identity || isSubmitting) return;

      setIsSubmitting(true);

      try {
        const result = answerInputRequest(ydoc, request.id, response, identity.username);

        if (!result.success) {
          handleAnswerError(result, onClose);
          return;
        }

        // Success - close modal and clear value
        // multiSelect only exists on 'choice' type requests
        setValue(request.type === 'choice' && request.multiSelect ? [] : '');
        onClose();
      } finally {
        setIsSubmitting(false);
      }
    },
    [ydoc, request, identity, isSubmitting, onClose, handleAnswerError]
  );

  const renderInput = () => {
    if (!request) return null;

    const baseProps = { request, value, setValue, isSubmitting };

    switch (request.type) {
      case 'text':
        return <TextInput {...baseProps} request={request} />;
      case 'multiline':
        return <MultilineInput {...baseProps} request={request} />;
      case 'choice':
        return (
          <ChoiceInput
            {...baseProps}
            request={request}
            customInput={customInput}
            setCustomInput={setCustomInput}
            isOtherSelected={isOtherSelected}
          />
        );
      case 'confirm':
        return (
          <ConfirmInput
            {...baseProps}
            request={request}
            remainingTime={remainingTime}
            onConfirmResponse={handleConfirmResponse}
          />
        );
      case 'number':
        return <NumberInput {...baseProps} request={request} />;
      case 'email':
        return <EmailInput {...baseProps} request={request} />;
      case 'date':
        return <DateInput {...baseProps} request={request} />;
      case 'dropdown':
        return <DropdownInput {...baseProps} request={request} />;
      case 'rating':
        return <RatingInput {...baseProps} request={request} />;
      default: {
        // Exhaustive check - TypeScript will error if new type added without case
        const _exhaustiveCheck: never = request;
        return (
          <Alert status="warning">
            <Alert.Content>
              <Alert.Title>Unsupported Input Type</Alert.Title>
              <Alert.Description>
                Type "{(_exhaustiveCheck as { type: string }).type}" is not supported.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        );
      }
    }
  };

  if (!request) return null;

  // Show sign-in prompt if no identity
  if (!identity) {
    return (
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => !open && handleModalClose()}
        isDismissable={false}
        isKeyboardDismissDisabled={true}
      >
        <Modal.Container placement="center" size="md">
          <Modal.Dialog>
            <Modal.CloseTrigger />

            <Card>
              <Card.Header>
                <h2 className="text-xl font-semibold">Agent is requesting input</h2>
              </Card.Header>

              <Card.Content>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Agent is asking:</p>
                    <p className="text-sm text-foreground">{request.message}</p>
                  </div>
                  <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Sign in required</Alert.Title>
                      <Alert.Description>
                        You need to sign in with GitHub to respond to this request. Your identity
                        will be recorded with your response.
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>

                  <div className="flex justify-between items-center pt-2">
                    <span
                      className={`text-sm ${remainingTime >= 0 && remainingTime < 30 ? 'text-warning' : 'text-muted-foreground'}`}
                    >
                      {remainingTime >= 0 && remainingTime < 30 && '! '}Timeout:{' '}
                      {formatTime(remainingTime)}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="secondary" onPress={handleDecline} isDisabled={isSubmitting}>
                        Decline
                      </Button>
                      <Button onPress={() => startAuth()}>Sign in with GitHub</Button>
                    </div>
                  </div>
                </div>
              </Card.Content>
            </Card>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );
  }

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleModalClose()}
      isDismissable={false}
      isKeyboardDismissDisabled={true}
    >
      <Modal.Container placement="center" size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />

          <Card>
            <Card.Header>
              <h2 className="text-xl font-semibold">Agent is requesting input</h2>
            </Card.Header>

            <Card.Content>
              <Form onSubmit={handleSubmit} className="space-y-4">
                <div>{renderInput()}</div>

                {request.type !== 'confirm' && (
                  <div className="flex justify-between items-center pt-2">
                    <span
                      className={`text-sm ${remainingTime >= 0 && remainingTime < 30 ? 'text-warning' : 'text-muted-foreground'}`}
                    >
                      {remainingTime >= 0 && remainingTime < 30 && '! '}Timeout:{' '}
                      {formatTime(remainingTime)}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="secondary" onPress={handleDecline} isDisabled={isSubmitting}>
                        Decline
                      </Button>
                      <Button
                        type="submit"
                        isDisabled={
                          isSubmitting ||
                          // Validation must pass for number/email/date types
                          !isInputValid(request, value) ||
                          (request.type === 'choice' && !request.options?.length) ||
                          // When "Other" is selected, require custom input text
                          (isOtherSelected && !customInput.trim()) ||
                          // For regular selections, require at least one option selected
                          (!isOtherSelected && (Array.isArray(value) ? value.length === 0 : !value))
                        }
                        isPending={isSubmitting}
                      >
                        Submit
                      </Button>
                    </div>
                  </div>
                )}
              </Form>
            </Card.Content>
          </Card>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
