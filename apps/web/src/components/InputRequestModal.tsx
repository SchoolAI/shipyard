/**
 * Modal component for responding to agent input requests.
 * Displays different input types (text, multiline, choice, confirm) with countdown timer.
 * Updates Y.Doc with user response or cancellation.
 */

import { Alert, Button, Card, Chip, Form, Link, Modal } from '@heroui/react';
import {
  type AnswerInputRequestResult,
  answerInputRequest,
  assertNever,
  cancelInputRequest,
  DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS,
  declineInputRequest,
  type InputRequest,
  logPlanEvent,
} from '@shipyard/schema';
import { AlertOctagon, ExternalLink } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import {
  ChoiceInput,
  ConfirmInput,
  DateInput,
  EmailInput,
  formatTime,
  MultilineInput,
  NA_OPTION_VALUE,
  NumberInput,
  OTHER_OPTION_VALUE,
  RatingInput,
  TextInput,
} from './inputs';

interface InputRequestModalProps {
  isOpen: boolean;
  request: InputRequest | null;
  ydoc: Y.Doc | null;
  planYdoc?: Y.Doc | null;
  onClose: () => void;
}

/** Basic email validation regex */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate number input against min/max bounds */
function validateNumberInput(
  value: string | string[],
  min: number | undefined,
  max: number | undefined
): boolean {
  const numStr = typeof value === 'string' ? value : '';
  if (!numStr) return true;
  const num = Number.parseFloat(numStr);
  if (Number.isNaN(num)) return false;
  if (min !== undefined && num < min) return false;
  if (max !== undefined && num > max) return false;
  return true;
}

/** Validate email input against format and optional domain restriction */
function validateEmailInput(value: string | string[], domain: string | undefined): boolean {
  const email = typeof value === 'string' ? value : '';
  if (!email.trim()) return true;
  if (!EMAIL_REGEX.test(email)) return false;
  if (domain && !email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
    return false;
  }
  return true;
}

/** Validate date input against format and optional min/max bounds */
function validateDateInput(
  value: string | string[],
  min: string | undefined,
  max: string | undefined
): boolean {
  const dateStr = typeof value === 'string' ? value : '';
  if (!dateStr) return true;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  if (min && date < new Date(min)) return false;
  if (max && date > new Date(max)) return false;
  return true;
}

/**
 * Validate input value based on request type.
 * Returns true if input is valid, false otherwise.
 * Used to disable submit button when validation fails.
 */
function isInputValid(request: InputRequest | null, value: string | string[]): boolean {
  if (!request) return true;

  switch (request.type) {
    case 'number':
      return validateNumberInput(value, request.min, request.max);
    case 'email':
      return validateEmailInput(value, request.domain);
    case 'date':
      return validateDateInput(value, request.min, request.max);
    default:
      return true;
  }
}

/**
 * Format the response value for submission.
 * Handles "Other" option for choice-type and rating-type questions and multi-select arrays.
 */
function formatResponseValue(
  request: InputRequest,
  value: string | string[],
  customInput: string,
  isOtherSelected: boolean,
  isNaSelected: boolean
): string {
  if (request.type === 'choice' && isOtherSelected) {
    if (Array.isArray(value)) {
      const selectedOptions = value.filter((v) => v !== OTHER_OPTION_VALUE);
      return [...selectedOptions, customInput.trim()].join(', ');
    }
    return customInput.trim();
  }
  if (request.type === 'rating') {
    if (isNaSelected) {
      return NA_OPTION_VALUE;
    }
    if (isOtherSelected) {
      return customInput.trim();
    }
  }
  return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * Determine if the submit button should be disabled.
 */
function isSubmitDisabled(
  isSubmitting: boolean,
  request: InputRequest,
  value: string | string[],
  isOtherSelected: boolean,
  customInput: string,
  isNaSelected: boolean
): boolean {
  if (isSubmitting) return true;
  if (!isInputValid(request, value)) return true;
  if (request.type === 'choice' && !request.options?.length) return true;
  if (request.type === 'rating' && isNaSelected) return false;
  if (isOtherSelected && !customInput.trim()) return true;
  if (!isOtherSelected && (Array.isArray(value) ? value.length === 0 : !value)) return true;
  return false;
}

/**
 * Get the default value state for a given request.
 */
function getDefaultValueState(request: InputRequest): string | string[] {
  if (request.type === 'choice' && request.multiSelect) {
    return request.defaultValue ? [request.defaultValue] : [];
  }
  return request.defaultValue || '';
}

/**
 * Get the reset value state for a given request.
 */
function getResetValueState(request: InputRequest): string | string[] {
  return request.type === 'choice' && request.multiSelect ? [] : '';
}

/**
 * Determines modal size and scroll behavior based on message content complexity.
 * Complex content (code blocks, tables, long text) gets a larger modal with scrolling.
 */
function getModalConfig(message: string): { isLarge: boolean; maxHeight: string | undefined } {
  const hasCodeBlock = /```[\s\S]*?```/.test(message);
  const hasTable = /\|.*\|.*\|/.test(message);
  const lineCount = message.split('\n').length;
  const charCount = message.length;

  if (hasCodeBlock || hasTable || lineCount > 15 || charCount > 800) {
    return { isLarge: true, maxHeight: '400px' };
  }
  if (lineCount > 8 || charCount > 400) {
    return { isLarge: false, maxHeight: '300px' };
  }
  return { isLarge: false, maxHeight: undefined };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Modal with multiple input types and auth states naturally has branching logic
export function InputRequestModal({
  isOpen,
  request,
  ydoc,
  planYdoc,
  onClose,
}: InputRequestModalProps) {
  const [value, setValue] = useState<string | string[]>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remainingTime, setRemainingTime] = useState(-1);
  const [customInput, setCustomInput] = useState('');
  const { identity, startAuth } = useGitHubAuth();

  const isChoiceOtherSelected =
    request?.type === 'choice' &&
    (Array.isArray(value) ? value.includes(OTHER_OPTION_VALUE) : value === OTHER_OPTION_VALUE);
  const isRatingOtherSelected =
    request?.type === 'rating' && typeof value === 'string' && value === OTHER_OPTION_VALUE;
  const isOtherSelected = isChoiceOtherSelected || isRatingOtherSelected;

  const isNaSelected =
    request?.type === 'rating' && typeof value === 'string' && value === NA_OPTION_VALUE;

  const modalConfig = useMemo(() => getModalConfig(request?.message || ''), [request?.message]);

  useEffect(() => {
    if (request) {
      setValue(getDefaultValueState(request));
      setCustomInput('');
    }
    setRemainingTime(-1);
  }, [request]);

  const handleCancel = useCallback(() => {
    if (!ydoc || !request) return;

    const result = cancelInputRequest(ydoc, request.id);
    if (!result.success) {
      return;
    }

    setValue(getResetValueState(request));
    onClose();
  }, [ydoc, request, onClose]);

  const handleDecline = useCallback(() => {
    if (!ydoc || !request) return;

    const result = declineInputRequest(ydoc, request.id);
    if (!result.success) {
      toast.error(result.error || 'Failed to decline request');
      return;
    }

    setValue(getResetValueState(request));
    onClose();
  }, [ydoc, request, onClose]);

  const handleModalClose = useCallback(() => {
    onClose();
  }, [onClose]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ydoc || !request || !identity || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const responseValue = formatResponseValue(
        request,
        value,
        customInput,
        isOtherSelected,
        isNaSelected
      );
      const result = answerInputRequest(ydoc, request.id, responseValue, identity.username);

      if (!result.success) {
        handleAnswerError(result, onClose);
        return;
      }

      if (planYdoc && request.planId) {
        logPlanEvent(planYdoc, 'input_request_answered', identity.username, {
          requestId: request.id,
          response: responseValue,
          answeredBy: identity.username,
          requestMessage: request.message,
          requestType: request.type,
        });
      }

      setValue(getResetValueState(request));
      setCustomInput('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmResponse = useCallback(
    (response: string) => {
      if (!ydoc || !request || !identity || isSubmitting) return;

      setIsSubmitting(true);

      try {
        const result = answerInputRequest(ydoc, request.id, response, identity.username);

        if (!result.success) {
          handleAnswerError(result, onClose);
          return;
        }

        if (planYdoc && request.planId) {
          logPlanEvent(planYdoc, 'input_request_answered', identity.username, {
            requestId: request.id,
            response,
            answeredBy: identity.username,
            requestMessage: request.message,
            requestType: request.type,
          });
        }

        setValue(getResetValueState(request));
        onClose();
      } finally {
        setIsSubmitting(false);
      }
    },
    [ydoc, planYdoc, request, identity, isSubmitting, onClose, handleAnswerError]
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
      case 'rating':
        return (
          <RatingInput
            {...baseProps}
            request={request}
            customInput={customInput}
            setCustomInput={setCustomInput}
            isOtherSelected={isRatingOtherSelected}
            isNaSelected={isNaSelected}
          />
        );
      default: {
        const _exhaustiveCheck: never = request;
        return (
          <Alert status="warning">
            <Alert.Content>
              <Alert.Title>Unsupported Input Type</Alert.Title>
              <Alert.Description>
                {/* eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SAFE-ASSERTION: Exhaustive switch - narrowing never to access discriminant for error message */}
                Type "{(_exhaustiveCheck as { type: string }).type}" is not supported.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        );
      }
    }
  };

  if (!request) return null;

  if (!identity) {
    return (
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => !open && handleModalClose()}
        isDismissable={false}
        isKeyboardDismissDisabled={true}
      >
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className={modalConfig.isLarge ? 'sm:max-w-[650px]' : undefined}>
            <Modal.CloseTrigger />

            <Card
              className={request.isBlocker ? 'border-2 border-danger ring-2 ring-danger/20' : ''}
            >
              <Card.Header>
                <div className="flex items-center gap-2">
                  {request.isBlocker && <AlertOctagon className="w-5 h-5 text-danger shrink-0" />}
                  <h2 className="text-xl font-semibold">
                    {request.isBlocker
                      ? 'BLOCKER: Agent needs your input'
                      : 'Agent is requesting input'}
                  </h2>
                  {request.isBlocker && (
                    <Chip color="danger" variant="primary" size="sm">
                      BLOCKER
                    </Chip>
                  )}
                </div>
              </Card.Header>

              <Card.Content>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Agent is asking:</p>
                    <MarkdownContent content={request.message} maxHeight={modalConfig.maxHeight} />
                  </div>
                  <Alert status={request.isBlocker ? 'danger' : 'warning'}>
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Sign in required</Alert.Title>
                      <Alert.Description>
                        You need to sign in with GitHub to respond to this request. Your identity
                        will be recorded with your response.
                        {request.isBlocker &&
                          ' This is a BLOCKER - the agent cannot proceed without your response.'}
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
        <Modal.Dialog className={modalConfig.isLarge ? 'sm:max-w-[650px]' : undefined}>
          <Modal.CloseTrigger />

          <Card className={request.isBlocker ? 'border-2 border-danger ring-2 ring-danger/20' : ''}>
            <Card.Header>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {request.isBlocker && <AlertOctagon className="w-5 h-5 text-danger shrink-0" />}
                  <h2 className="text-xl font-semibold">
                    {request.isBlocker
                      ? 'BLOCKER: Agent needs your input'
                      : 'Agent is requesting input'}
                  </h2>
                  {request.isBlocker && (
                    <Chip color="danger" variant="primary" size="sm">
                      BLOCKER
                    </Chip>
                  )}
                </div>
                {request.planId && (
                  <Link
                    href={`/task/${request.planId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm text-accent hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Plan
                  </Link>
                )}
              </div>
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
                        isDisabled={isSubmitDisabled(
                          isSubmitting,
                          request,
                          value,
                          isOtherSelected,
                          customInput,
                          isNaSelected
                        )}
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
