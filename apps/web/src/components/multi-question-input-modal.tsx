import {
  Alert,
  Button,
  Card,
  Chip,
  Form,
  Label,
  Link,
  Modal,
  Radio,
  RadioGroup,
  TextArea,
  TextField,
} from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { AlertOctagon, ExternalLink } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { MarkdownContent } from '@/components/ui/markdown-content';
import { getTaskRoute } from '@/constants/routes';
import { INTERVALS, THRESHOLDS } from '@/constants/timings';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useTaskDocument } from '@/loro/use-task-document';
import type { MultiInputRequest } from './input-request-types';
import {
  ChoiceInput,
  formatTime,
  MultilineInput,
  NumberInput,
  OTHER_OPTION_VALUE,
  TextInput,
} from './inputs';

export type { MultiInputRequest } from './input-request-types';

type Question = MultiInputRequest['questions'][number];

interface MultiQuestionInputModalProps {
  isOpen: boolean;
  request: MultiInputRequest | null;
  taskId: TaskId;
  onClose: () => void;
}

function validateNumberInput(
  value: string | string[],
  question: { min?: number | null; max?: number | null }
): boolean {
  const numStr = typeof value === 'string' ? value : '';
  if (!numStr) return true;
  const num = Number.parseFloat(numStr);
  if (Number.isNaN(num)) return false;
  if (question.min !== undefined && question.min !== null && num < question.min) return false;
  if (question.max !== undefined && question.max !== null && num > question.max) return false;
  return true;
}

interface QuestionState {
  value: string | string[];
  customInput: string;
}

function getDefaultQuestionState(question: Question): QuestionState {
  if (question.type === 'choice' && question.multiSelect) {
    return {
      value: [],
      customInput: '',
    };
  }
  if (
    question.type === 'number' &&
    question.defaultValue !== null &&
    question.defaultValue !== undefined
  ) {
    return {
      value: String(question.defaultValue),
      customInput: '',
    };
  }
  return {
    value: '',
    customInput: '',
  };
}

function formatConfirmResponse(value: string | string[], customInput: string): string {
  const strValue = typeof value === 'string' ? value : '';
  if (strValue === '__explain__') {
    return customInput.trim();
  }
  return strValue;
}

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

function formatDefaultResponse(value: string | string[]): string {
  return Array.isArray(value) ? value.join(', ') : value;
}

function formatQuestionResponse(question: Question, state: QuestionState): string {
  const { value, customInput } = state;

  switch (question.type) {
    case 'confirm':
      return formatConfirmResponse(value, customInput);
    case 'choice':
      return formatChoiceResponse(value, customInput);
    case 'text':
    case 'multiline':
    case 'number':
      return formatDefaultResponse(value);
    default:
      return formatDefaultResponse(value);
  }
}

function hasOtherSelected(value: string | string[]): boolean {
  return Array.isArray(value) ? value.includes(OTHER_OPTION_VALUE) : value === OTHER_OPTION_VALUE;
}

function isConfirmSubmittable(value: string | string[], customInput: string): boolean {
  const strValue = typeof value === 'string' ? value : '';
  if (strValue === '__explain__') {
    return !!customInput.trim();
  }
  return strValue === 'yes' || strValue === 'no';
}

function isChoiceSubmittable(
  question: Extract<Question, { type: 'choice' }>,
  value: string | string[],
  customInput: string
): boolean {
  const options = question.options || [];
  if (options.length === 0) return false;

  const otherSelected = hasOtherSelected(value);
  if (otherSelected && !customInput.trim()) return false;
  if (!otherSelected && (Array.isArray(value) ? value.length === 0 : !value)) return false;
  return true;
}

function isDefaultSubmittable(value: string | string[]): boolean {
  return Array.isArray(value) ? value.length > 0 : !!value;
}

function isQuestionInputValid(question: Question, value: string | string[]): boolean {
  switch (question.type) {
    case 'number':
      return validateNumberInput(value, question);
    default:
      return true;
  }
}

function isQuestionSubmittable(question: Question, state: QuestionState): boolean {
  const { value, customInput } = state;

  if (!isQuestionInputValid(question, value)) return false;

  switch (question.type) {
    case 'confirm':
      return isConfirmSubmittable(value, customInput);
    case 'choice':
      return isChoiceSubmittable(question, value, customInput);
    case 'text':
    case 'multiline':
    case 'number':
      return isDefaultSubmittable(value);
    default:
      return isDefaultSubmittable(value);
  }
}

function SignInPrompt({
  request,
  remainingTime,
  isSubmitting,
  onDecline,
  onSignIn,
  onClose,
}: {
  request: MultiInputRequest;
  remainingTime: number;
  isSubmitting: boolean;
  onDecline: () => void;
  onSignIn: () => void;
  onClose: () => void;
}) {
  const isBlocker = request.isBlocker;
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
          <Card className={isBlocker ? 'border-2 border-danger ring-2 ring-danger/20' : ''}>
            <Card.Header>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isBlocker && <AlertOctagon className="w-5 h-5 text-danger shrink-0" />}
                  <h2 className="text-xl font-semibold">
                    {isBlocker ? 'BLOCKER: Agent needs your input' : 'Agent is requesting input'}
                  </h2>
                  {isBlocker && (
                    <Chip color="danger" variant="primary" size="sm">
                      BLOCKER
                    </Chip>
                  )}
                </div>
              </div>
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
                        <MarkdownContent content={q.message} variant="compact" className="inline" />
                      </li>
                    ))}
                  </ul>
                </div>
                <Alert status={isBlocker ? 'danger' : 'warning'}>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Sign in required</Alert.Title>
                    <Alert.Description>
                      You need to sign in with GitHub to respond to this request. Your identity will
                      be recorded with your response.
                      {isBlocker &&
                        ' This is a BLOCKER - the agent cannot proceed without your response.'}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
                <div className="flex justify-between items-center pt-2">
                  <span
                    className={`text-sm ${remainingTime >= 0 && remainingTime < THRESHOLDS.TIMEOUT_WARNING ? 'text-warning' : 'text-muted-foreground'}`}
                  >
                    {remainingTime >= 0 && remainingTime < THRESHOLDS.TIMEOUT_WARNING && '! '}
                    Timeout: {formatTime(remainingTime)}
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
  taskId,
  onClose,
}: MultiQuestionInputModalProps) {
  const [questionStates, setQuestionStates] = useState<QuestionState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remainingTime, setRemainingTime] = useState(-1);
  const { identity, startAuth } = useGitHubAuth();
  const taskDoc = useTaskDocument(taskId);

  useEffect(() => {
    if (request) {
      setQuestionStates(request.questions.map(getDefaultQuestionState));
    }
    setRemainingTime(-1);
  }, [request]);

  const handleCancel = useCallback(() => {
    if (!request) return;

    const inputRequests = taskDoc.inputRequests;
    const requests = inputRequests.toJSON();
    const idx = requests.findIndex((r: { id: string }) => r.id === request.id);
    if (idx !== -1) {
      const req = inputRequests.get(idx);
      if (req) {
        req.status = 'cancelled';
      }
    }
    taskDoc.syncPendingRequestsToRoom();

    setQuestionStates([]);
    onClose();
  }, [request, taskDoc, onClose]);

  const handleDecline = useCallback(() => {
    if (!request) return;

    const inputRequests = taskDoc.inputRequests;
    const requests = inputRequests.toJSON();
    const idx = requests.findIndex((r: { id: string }) => r.id === request.id);
    if (idx !== -1) {
      const req = inputRequests.get(idx);
      if (req) {
        req.status = 'declined';
      }
    }
    taskDoc.syncPendingRequestsToRoom();

    setQuestionStates([]);
    onClose();
  }, [request, taskDoc, onClose]);

  const handleModalClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!request || !isOpen) return;

    const timeout = Math.floor((request.expiresAt - request.createdAt) / 1000);
    const elapsed = Math.floor((Date.now() - request.createdAt) / 1000);
    const remaining = Math.max(0, timeout - elapsed);

    setRemainingTime(remaining);

    const interval = setInterval(() => {
      const newElapsed = Math.floor((Date.now() - request.createdAt) / 1000);
      const newRemaining = Math.max(0, timeout - newElapsed);
      setRemainingTime(newRemaining);
    }, INTERVALS.COUNTDOWN_UPDATE);

    return () => clearInterval(interval);
  }, [request, isOpen]);

  useEffect(() => {
    if (remainingTime === 0 && isOpen && request) {
      handleCancel();
    }
  }, [remainingTime, isOpen, request, handleCancel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || !identity || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const responses: Record<string, string> = {};
      for (let i = 0; i < request.questions.length; i++) {
        const question = request.questions[i];
        const state = questionStates[i];
        if (question && state) {
          responses[String(i)] = formatQuestionResponse(question, state);
        }
      }

      const inputRequests = taskDoc.inputRequests;
      const requestsJson = inputRequests.toJSON();
      const idx = requestsJson.findIndex((r: { id: string }) => r.id === request.id);
      if (idx !== -1) {
        const req = inputRequests.get(idx);
        if (req) {
          req.status = 'answered';
          req.response = JSON.stringify(responses);
          req.answeredAt = Date.now();
          req.answeredBy = identity.username;
        }
      }
      taskDoc.syncPendingRequestsToRoom();
      taskDoc.logEvent('input_request_answered', identity.username, {
        requestId: request.id,
      });

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

  const renderConfirmQuestion = (
    question: Question,
    value: string | string[],
    customInput: string,
    index: number
  ) => {
    const showExplainInput = typeof value === 'string' && value === '__explain__';
    return (
      <div className="space-y-3">
        <MarkdownContent content={question.message} variant="default" />
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

  const buildBaseRequestProps = (question: Question, index: number) => ({
    id: `${request?.id}-q${index}`,
    message: question.message,
    status: 'pending' as const,
    createdAt: request?.createdAt || Date.now(),
    expiresAt: request?.expiresAt || Date.now() + 300000,
    response: null,
    answeredAt: null,
    answeredBy: null,
    isBlocker: null,
  });

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
        return (
          <TextInput
            {...baseInputProps}
            request={{
              ...baseRequestProps,
              type: 'text',
              defaultValue: null,
              placeholder: null,
            }}
          />
        );
      case 'multiline':
        return (
          <MultilineInput
            {...baseInputProps}
            request={{
              ...baseRequestProps,
              type: 'multiline',
              defaultValue: null,
              placeholder: null,
            }}
          />
        );
      case 'choice':
        return (
          <ChoiceInput
            {...baseInputProps}
            request={{
              ...baseRequestProps,
              type: 'choice',
              options: question.options.map((o) => ({
                label: o.label,
                value: o.value,
                description: o.description,
              })),
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
              min: question.min ?? null,
              max: question.max ?? null,
              format: question.format ?? null,
              defaultValue: question.defaultValue ?? null,
            }}
          />
        );
      default:
        return (
          <Alert status="warning">
            <Alert.Content>
              <Alert.Title>Unsupported Question Type</Alert.Title>
              <Alert.Description>This question type is not supported.</Alert.Description>
            </Alert.Content>
          </Alert>
        );
    }
  };

  const isFormSubmittable = (): boolean => {
    if (!request || questionStates.length !== request.questions.length) return false;
    return request.questions.every((question, index) => {
      const state = questionStates[index];
      return state && isQuestionSubmittable(question, state);
    });
  };

  if (!request) return null;

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

  const isBlocker = request.isBlocker;

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

          <Card className={isBlocker ? 'border-2 border-danger ring-2 ring-danger/20' : ''}>
            <Card.Header className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {isBlocker && <AlertOctagon className="w-5 h-5 text-danger shrink-0" />}
                <h2 className="text-xl font-semibold">
                  {isBlocker ? 'BLOCKER: ' : ''}Agent is requesting input (
                  {request.questions.length} question
                  {request.questions.length > 1 ? 's' : ''})
                </h2>
                {isBlocker && (
                  <Chip color="danger" variant="primary" size="sm">
                    BLOCKER
                  </Chip>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href={getTaskRoute(taskId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Task
                </Link>
                <span
                  className={`text-sm ${remainingTime >= 0 && remainingTime < THRESHOLDS.TIMEOUT_WARNING ? 'text-warning' : 'text-muted-foreground'}`}
                >
                  {remainingTime >= 0 && remainingTime < THRESHOLDS.TIMEOUT_WARNING && '! '}
                  Timeout: {formatTime(remainingTime)}
                </span>
              </div>
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
