/**
 * Modal component for responding to multi-question input requests.
 * Displays 1-10 questions in a single form with sequential numbering (8 recommended for optimal UX).
 * Updates Y.Doc with user responses or cancellation.
 */

import {
  Alert,
  Button,
  Card,
  Form,
  Label,
  Modal,
  Radio,
  RadioGroup,
  TextArea,
  TextField,
} from '@heroui/react';
import {
  type AnswerInputRequestResult,
  answerMultiQuestionInputRequest,
  assertNever,
  cancelInputRequest,
  DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS,
  declineInputRequest,
  type MultiQuestionInputRequest,
  normalizeChoiceOptions,
  type Question,
} from '@shipyard/schema';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import {
  ChoiceInput,
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

interface MultiQuestionInputModalProps {
  isOpen: boolean;
  request: MultiQuestionInputRequest | null;
  ydoc: Y.Doc | null;
  onClose: () => void;
}

/** Basic email validation regex */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate number input against min/max bounds */
function validateNumberInput(
  value: string | string[],
  question: { min?: number; max?: number }
): boolean {
  const numStr = typeof value === 'string' ? value : '';
  if (!numStr) return true; // Empty is handled by required check
  const num = Number.parseFloat(numStr);
  if (Number.isNaN(num)) return false;
  if (question.min !== undefined && num < question.min) return false;
  if (question.max !== undefined && num > question.max) return false;
  return true;
}

/** Validate email input against format and optional domain restriction */
function validateEmailInput(value: string | string[], question: { domain?: string }): boolean {
  const email = typeof value === 'string' ? value : '';
  if (!email.trim()) return true; // Empty is handled by required check
  if (!EMAIL_REGEX.test(email)) return false;
  if (question.domain && !email.toLowerCase().endsWith(`@${question.domain.toLowerCase()}`)) {
    return false;
  }
  return true;
}

/** Validate date input against format and optional min/max bounds */
function validateDateInput(
  value: string | string[],
  question: { min?: string; max?: string }
): boolean {
  const dateStr = typeof value === 'string' ? value : '';
  if (!dateStr) return true; // Empty is handled by required check
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  if (question.min && date < new Date(question.min)) return false;
  if (question.max && date > new Date(question.max)) return false;
  return true;
}

/** Validate input value based on question type */
function isQuestionInputValid(question: Question, value: string | string[]): boolean {
  switch (question.type) {
    case 'number':
      return validateNumberInput(value, question);
    case 'email':
      return validateEmailInput(value, question);
    case 'date':
      return validateDateInput(value, question);
    default:
      return true;
  }
}

/** State for a single question */
interface QuestionState {
  value: string | string[];
  customInput: string;
}

/** Get default state for a question based on its type */
function getDefaultQuestionState(question: Question): QuestionState {
  if (question.type === 'choice' && question.multiSelect) {
    return {
      value: question.defaultValue ? [question.defaultValue] : [],
      customInput: '',
    };
  }
  return {
    value: question.defaultValue || '',
    customInput: '',
  };
}

/** Format response for confirm-type questions with Explain option */
function formatConfirmResponse(value: string | string[], customInput: string): string {
  const strValue = typeof value === 'string' ? value : '';
  if (strValue === '__explain__') {
    return customInput.trim();
  }
  return strValue;
}

/** Format response for choice-type questions with Other option */
function formatChoiceResponse(value: string | string[], customInput: string): string {
  const hasOther = Array.isArray(value)
    ? value.includes(OTHER_OPTION_VALUE)
    : value === OTHER_OPTION_VALUE;

  if (!hasOther) {
    return Array.isArray(value) ? value.join(', ') : value;
  }

  if (Array.isArray(value)) {
    const selectedOptions = value.filter((v) => v !== OTHER_OPTION_VALUE);
    return [...selectedOptions, customInput.trim()].join(', ');
  }
  return customInput.trim();
}

/** Format response for rating-type questions with N/A and Other options */
function formatRatingResponse(value: string | string[], customInput: string): string {
  const strValue = typeof value === 'string' ? value : '';
  if (strValue === NA_OPTION_VALUE) {
    return NA_OPTION_VALUE;
  }
  if (strValue === OTHER_OPTION_VALUE) {
    return customInput.trim();
  }
  return strValue;
}

/** Format response for default types (text, multiline, number, email, date) */
function formatDefaultResponse(value: string | string[]): string {
  return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * Format response value for a question.
 * Dispatches to type-specific formatters for handling escape hatches.
 */
function formatQuestionResponse(question: Question, state: QuestionState): string {
  const { value, customInput } = state;

  switch (question.type) {
    case 'confirm':
      return formatConfirmResponse(value, customInput);
    case 'choice':
      return formatChoiceResponse(value, customInput);
    case 'rating':
      return formatRatingResponse(value, customInput);
    case 'text':
    case 'multiline':
    case 'number':
    case 'email':
    case 'date':
      return formatDefaultResponse(value);
    default: {
      const _exhaustive: never = question;
      return formatDefaultResponse(value);
    }
  }
}

/** Check if value has "Other" option selected */
function hasOtherSelected(value: string | string[]): boolean {
  return Array.isArray(value) ? value.includes(OTHER_OPTION_VALUE) : value === OTHER_OPTION_VALUE;
}

/** Check if value has "N/A" option selected */
function hasNaSelected(value: string | string[]): boolean {
  return typeof value === 'string' && value === NA_OPTION_VALUE;
}

/** Validate confirm-type question submission */
function isConfirmSubmittable(value: string | string[], customInput: string): boolean {
  const strValue = typeof value === 'string' ? value : '';
  if (strValue === '__explain__') {
    return !!customInput.trim();
  }
  return strValue === 'yes' || strValue === 'no';
}

/** Validate choice-type question submission */
function isChoiceSubmittable(
  question: Extract<Question, { type: 'choice' }>,
  value: string | string[],
  customInput: string
): boolean {
  const options = normalizeChoiceOptions(question.options || []);
  if (options.length === 0) return false;

  const otherSelected = hasOtherSelected(value);
  if (otherSelected && !customInput.trim()) return false;
  if (!otherSelected && (Array.isArray(value) ? value.length === 0 : !value)) return false;
  return true;
}

/** Validate rating-type question submission */
function isRatingSubmittable(value: string | string[], customInput: string): boolean {
  const strValue = typeof value === 'string' ? value : '';
  // N/A is always valid
  if (strValue === NA_OPTION_VALUE) return true;
  // Other requires custom input
  if (strValue === OTHER_OPTION_VALUE) return !!customInput.trim();
  // Normal rating (number as string)
  return !!strValue && strValue !== '';
}

/** Validate default types (text, multiline, number, email, date) submission */
function isDefaultSubmittable(value: string | string[]): boolean {
  return Array.isArray(value) ? value.length > 0 : !!value;
}

/**
 * Check if a question state is valid for submission.
 * Dispatches to type-specific validators.
 */
function isQuestionSubmittable(question: Question, state: QuestionState): boolean {
  const { value, customInput } = state;

  if (!isQuestionInputValid(question, value)) return false;

  switch (question.type) {
    case 'confirm':
      return isConfirmSubmittable(value, customInput);
    case 'choice':
      return isChoiceSubmittable(question, value, customInput);
    case 'rating':
      return isRatingSubmittable(value, customInput);
    case 'text':
    case 'multiline':
    case 'number':
    case 'email':
    case 'date':
      return isDefaultSubmittable(value);
    default: {
      const _exhaustive: never = question;
      return isDefaultSubmittable(value);
    }
  }
}

/** Render sign-in prompt content */
function SignInPrompt({
  request,
  remainingTime,
  isSubmitting,
  onDecline,
  onSignIn,
  onClose,
}: {
  request: MultiQuestionInputRequest;
  remainingTime: number;
  isSubmitting: boolean;
  onDecline: () => void;
  onSignIn: () => void;
  onClose: () => void;
}) {
  return (
    <Modal.Backdrop
      isOpen={true}
      onOpenChange={(open) => !open && onClose()}
      isDismissable={false}
      isKeyboardDismissDisabled={true}
    >
      <Modal.Container placement="center" size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Card>
            <Card.Header>
              <h2 className="text-xl font-semibold">Agent is requesting input</h2>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Agent is asking {request.questions.length} question
                    {request.questions.length > 1 ? 's' : ''}:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                    {request.questions.map((q, i) => (
                      <li key={i} className="truncate">
                        {q.message}
                      </li>
                    ))}
                  </ul>
                </div>
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Sign in required</Alert.Title>
                    <Alert.Description>
                      You need to sign in with GitHub to respond to this request. Your identity will
                      be recorded with your response.
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
                    <Button variant="secondary" onPress={onDecline} isDisabled={isSubmitting}>
                      Decline
                    </Button>
                    <Button onPress={onSignIn}>Sign in with GitHub</Button>
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

export function MultiQuestionInputModal({
  isOpen,
  request,
  ydoc,
  onClose,
}: MultiQuestionInputModalProps) {
  const [questionStates, setQuestionStates] = useState<QuestionState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remainingTime, setRemainingTime] = useState(-1);
  const { identity, startAuth } = useGitHubAuth();

  // Reset state when request changes
  useEffect(() => {
    if (request) {
      setQuestionStates(request.questions.map(getDefaultQuestionState));
    }
    setRemainingTime(-1);
  }, [request]);

  // Used for auto-timeout
  const handleCancel = useCallback(() => {
    if (!ydoc || !request) return;

    const result = cancelInputRequest(ydoc, request.id);
    if (!result.success) {
      return;
    }

    setQuestionStates([]);
    onClose();
  }, [ydoc, request, onClose]);

  // Used when user explicitly clicks "Decline"
  const handleDecline = useCallback(() => {
    if (!ydoc || !request) return;

    const result = declineInputRequest(ydoc, request.id);
    if (!result.success) {
      return;
    }

    setQuestionStates([]);
    onClose();
  }, [ydoc, request, onClose]);

  const handleModalClose = useCallback(() => {
    onClose();
  }, [onClose]);

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

  // Countdown timer
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
  useEffect(() => {
    if (remainingTime === 0 && isOpen && request) {
      handleCancel();
    }
  }, [remainingTime, isOpen, request, handleCancel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ydoc || !request || !identity || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Build responses record
      const responses: Record<string, string> = {};
      for (let i = 0; i < request.questions.length; i++) {
        const question = request.questions[i];
        const state = questionStates[i];
        if (question && state) {
          responses[String(i)] = formatQuestionResponse(question, state);
        }
      }

      const result = answerMultiQuestionInputRequest(
        ydoc,
        request.id,
        responses,
        identity.username
      );

      if (!result.success) {
        handleAnswerError(result, onClose);
        return;
      }

      setQuestionStates([]);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateQuestionState = (index: number, update: Partial<QuestionState>) => {
    setQuestionStates((prev) => {
      const newStates = [...prev];
      const current = newStates[index];
      if (current) {
        newStates[index] = { ...current, ...update };
      }
      return newStates;
    });
  };

  /** Render confirm question with explain option in multi-question context */
  const renderConfirmQuestion = (
    question: Question,
    value: string | string[],
    customInput: string,
    index: number
  ) => {
    const showExplainInput = typeof value === 'string' && value === '__explain__';
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground">{question.message}</p>
        {showExplainInput ? (
          <div className="space-y-3">
            <TextField isDisabled={isSubmitting}>
              <Label className="text-sm font-medium text-foreground">Please explain:</Label>
              <TextArea
                value={customInput}
                onChange={(e) => updateQuestionState(index, { customInput: e.target.value })}
                placeholder="Type your answer..."
                rows={3}
                autoFocus
              />
            </TextField>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => updateQuestionState(index, { value: '', customInput: '' })}
              isDisabled={isSubmitting}
            >
              Back
            </Button>
          </div>
        ) : (
          <RadioGroup
            value={typeof value === 'string' ? value : ''}
            onChange={(val) => updateQuestionState(index, { value: val })}
            orientation="horizontal"
            className="flex gap-3"
            isDisabled={isSubmitting}
          >
            <Radio value="yes">
              <Radio.Control />
              <Radio.Content>
                <Label>Yes</Label>
              </Radio.Content>
            </Radio>
            <Radio value="no">
              <Radio.Control />
              <Radio.Content>
                <Label>No</Label>
              </Radio.Content>
            </Radio>
            <Radio value="__explain__">
              <Radio.Control />
              <Radio.Content>
                <Label>Explain...</Label>
              </Radio.Content>
            </Radio>
          </RadioGroup>
        )}
      </div>
    );
  };

  /** Build base request props for input components */
  const buildBaseRequestProps = (question: Question, index: number) => ({
    id: `${request?.id}-q${index}`,
    createdAt: request?.createdAt || Date.now(),
    status: 'pending' as const,
    message: question.message,
    defaultValue: question.defaultValue,
  });

  /** Build base input props for input components */
  const buildBaseInputProps = (value: string | string[], index: number) => ({
    value,
    setValue: (val: string | string[]) => updateQuestionState(index, { value: val }),
    isSubmitting,
  });

  const renderQuestion = (question: Question, index: number) => {
    const state = questionStates[index];
    if (!state) return null;

    const { value, customInput } = state;
    const baseRequestProps = buildBaseRequestProps(question, index);
    const baseInputProps = buildBaseInputProps(value, index);

    switch (question.type) {
      case 'text':
        return <TextInput {...baseInputProps} request={{ ...baseRequestProps, type: 'text' }} />;
      case 'multiline':
        return (
          <MultilineInput
            {...baseInputProps}
            request={{ ...baseRequestProps, type: 'multiline' }}
          />
        );
      case 'choice':
        return (
          <ChoiceInput
            {...baseInputProps}
            request={{
              ...baseRequestProps,
              type: 'choice',
              options: question.options,
              multiSelect: question.multiSelect,
              displayAs: question.displayAs,
              placeholder: question.placeholder,
            }}
            customInput={customInput}
            setCustomInput={(val) => updateQuestionState(index, { customInput: val })}
            isOtherSelected={hasOtherSelected(value)}
          />
        );
      case 'confirm':
        return renderConfirmQuestion(question, value, customInput, index);
      case 'number':
        return (
          <NumberInput
            {...baseInputProps}
            request={{
              ...baseRequestProps,
              type: 'number',
              min: question.min,
              max: question.max,
              format: question.format,
            }}
          />
        );
      case 'email':
        return (
          <EmailInput
            {...baseInputProps}
            request={{ ...baseRequestProps, type: 'email', domain: question.domain }}
          />
        );
      case 'date':
        return (
          <DateInput
            {...baseInputProps}
            request={{ ...baseRequestProps, type: 'date', min: question.min, max: question.max }}
          />
        );
      case 'rating':
        return (
          <RatingInput
            {...baseInputProps}
            request={{
              ...baseRequestProps,
              type: 'rating',
              min: question.min,
              max: question.max,
              style: question.style,
              labels: question.labels,
            }}
            customInput={customInput}
            setCustomInput={(val) => updateQuestionState(index, { customInput: val })}
            isOtherSelected={hasOtherSelected(value)}
            isNaSelected={hasNaSelected(value)}
          />
        );
      default: {
        const _exhaustiveCheck: never = question;
        return (
          <Alert status="warning">
            <Alert.Content>
              <Alert.Title>Unsupported Question Type</Alert.Title>
              <Alert.Description>
                Type "{(_exhaustiveCheck as { type: string }).type}" is not supported.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        );
      }
    }
  };

  // Check if all questions are submittable
  const isFormSubmittable = (): boolean => {
    if (!request || questionStates.length !== request.questions.length) return false;
    return request.questions.every((question, index) => {
      const state = questionStates[index];
      return state && isQuestionSubmittable(question, state);
    });
  };

  if (!request) return null;

  // Show sign-in prompt if no identity
  if (!identity) {
    return (
      <SignInPrompt
        request={request}
        remainingTime={remainingTime}
        isSubmitting={isSubmitting}
        onDecline={handleDecline}
        onSignIn={() => startAuth()}
        onClose={handleModalClose}
      />
    );
  }

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleModalClose()}
      isDismissable={false}
      isKeyboardDismissDisabled={true}
    >
      <Modal.Container placement="center" size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger />

          <Card>
            <Card.Header className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">
                Agent is requesting input ({request.questions.length} question
                {request.questions.length > 1 ? 's' : ''})
              </h2>
              <span
                className={`text-sm ${remainingTime >= 0 && remainingTime < 30 ? 'text-warning' : 'text-muted-foreground'}`}
              >
                {remainingTime >= 0 && remainingTime < 30 && '! '}Timeout:{' '}
                {formatTime(remainingTime)}
              </span>
            </Card.Header>

            <Form onSubmit={handleSubmit}>
              <Card.Content className="max-h-[60vh] min-h-[20vh] overflow-y-auto px-6 py-4">
                <div className="space-y-6">
                  {request.questions.map((question, index) => (
                    <div key={index} className="space-y-2">
                      {request.questions.length > 1 && (
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Question {index + 1} of {request.questions.length}
                        </p>
                      )}
                      {renderQuestion(question, index)}
                    </div>
                  ))}
                </div>
              </Card.Content>

              <Card.Footer className="sticky bottom-0 bg-background border-t">
                <div className="flex justify-end items-center w-full gap-2">
                  <Button variant="secondary" onPress={handleDecline} isDisabled={isSubmitting}>
                    Decline
                  </Button>
                  <Button
                    type="submit"
                    isDisabled={isSubmitting || !isFormSubmittable()}
                    isPending={isSubmitting}
                  >
                    Submit All
                  </Button>
                </div>
              </Card.Footer>
            </Form>
          </Card>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
