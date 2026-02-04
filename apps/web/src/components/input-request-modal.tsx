import { Alert, Button, Card, Chip, Form, Link, Modal } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { AlertOctagon, ExternalLink } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MarkdownContent } from '@/components/ui/markdown-content';
import { getTaskRoute } from '@/constants/routes';
import { INTERVALS, THRESHOLDS } from '@/constants/timings';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useTaskDocument } from '@/loro/use-task-document';
import type { SingleInputRequest } from './input-request-types';
import {
  ChoiceInput,
  type ChoiceInputRequest,
  ConfirmInput,
  type ConfirmInputRequest,
  formatTime,
  MultilineInput,
  type MultilineInputRequest,
  NA_OPTION_VALUE,
  NumberInput,
  type NumberInputRequest,
  OTHER_OPTION_VALUE,
  TextInput,
  type TextInputRequest,
} from './inputs';

export type { SingleInputRequest } from './input-request-types';

interface InputRequestModalProps {
  isOpen: boolean;
  request: SingleInputRequest | null;
  taskId: TaskId;
  onClose: () => void;
}

function validateNumberInput(
  value: string | string[],
  min: number | null | undefined,
  max: number | null | undefined
): boolean {
  const numStr = typeof value === 'string' ? value : '';
  if (!numStr) return true;
  const num = Number.parseFloat(numStr);
  if (Number.isNaN(num)) return false;
  if (min !== undefined && min !== null && num < min) return false;
  if (max !== undefined && max !== null && num > max) return false;
  return true;
}

function isInputValid(request: SingleInputRequest | null, value: string | string[]): boolean {
  if (!request) return true;

  switch (request.type) {
    case 'number':
      return validateNumberInput(value, request.min, request.max);
    case 'text':
    case 'multiline':
    case 'choice':
    case 'confirm':
      return true;
    default:
      return true;
  }
}

function formatResponseValue(
  request: SingleInputRequest,
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
  if (isNaSelected) {
    return NA_OPTION_VALUE;
  }
  if (isOtherSelected) {
    return customInput.trim();
  }
  return Array.isArray(value) ? value.join(', ') : value;
}

function isSubmitDisabled(
  isSubmitting: boolean,
  request: SingleInputRequest,
  value: string | string[],
  isOtherSelected: boolean,
  customInput: string,
  isNaSelected: boolean
): boolean {
  if (isSubmitting) return true;
  if (!isInputValid(request, value)) return true;
  if (request.type === 'choice' && !request.options?.length) return true;
  if (isNaSelected) return false;
  if (isOtherSelected && !customInput.trim()) return true;
  if (!isOtherSelected && (Array.isArray(value) ? value.length === 0 : !value)) return true;
  return false;
}

function getDefaultValueState(request: SingleInputRequest): string | string[] {
  if (request.type === 'choice' && request.multiSelect) {
    return [];
  }
  if (request.type === 'number' && request.defaultValue !== null) {
    return String(request.defaultValue);
  }
  if ((request.type === 'text' || request.type === 'multiline') && request.defaultValue) {
    return request.defaultValue;
  }
  return '';
}

function getResetValueState(request: SingleInputRequest): string | string[] {
  return request.type === 'choice' && request.multiSelect ? [] : '';
}

function getModalConfig(message: string): {
  isLarge: boolean;
  maxHeight: string | undefined;
} {
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

function adaptToTextRequest(
  request: Extract<SingleInputRequest, { type: 'text' }>
): TextInputRequest {
  return {
    id: request.id,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    response: request.response,
    answeredAt: request.answeredAt,
    answeredBy: request.answeredBy,
    isBlocker: request.isBlocker,
    type: 'text',
    defaultValue: request.defaultValue,
    placeholder: request.placeholder,
  };
}

function adaptToMultilineRequest(
  request: Extract<SingleInputRequest, { type: 'multiline' }>
): MultilineInputRequest {
  return {
    id: request.id,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    response: request.response,
    answeredAt: request.answeredAt,
    answeredBy: request.answeredBy,
    isBlocker: request.isBlocker,
    type: 'multiline',
    defaultValue: request.defaultValue,
    placeholder: request.placeholder,
  };
}

function adaptToChoiceRequest(
  request: Extract<SingleInputRequest, { type: 'choice' }>
): ChoiceInputRequest {
  return {
    id: request.id,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    response: request.response,
    answeredAt: request.answeredAt,
    answeredBy: request.answeredBy,
    isBlocker: request.isBlocker,
    type: 'choice',
    options: request.options.map((o) => ({
      label: o.label,
      value: o.value,
      description: o.description,
    })),
    multiSelect: request.multiSelect,
    displayAs: request.displayAs,
    placeholder: request.placeholder,
  };
}

function adaptToConfirmRequest(
  request: Extract<SingleInputRequest, { type: 'confirm' }>
): ConfirmInputRequest {
  return {
    id: request.id,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    response: request.response,
    answeredAt: request.answeredAt,
    answeredBy: request.answeredBy,
    isBlocker: request.isBlocker,
    type: 'confirm',
  };
}

function adaptToNumberRequest(
  request: Extract<SingleInputRequest, { type: 'number' }>
): NumberInputRequest {
  return {
    id: request.id,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    response: request.response,
    answeredAt: request.answeredAt,
    answeredBy: request.answeredBy,
    isBlocker: request.isBlocker,
    type: 'number',
    min: request.min,
    max: request.max,
    format: request.format,
    defaultValue: request.defaultValue,
  };
}

function updateRequestStatus(
  taskDoc: ReturnType<typeof useTaskDocument>,
  requestId: string,
  status: 'pending' | 'answered' | 'declined' | 'cancelled'
): void {
  const inputRequests = taskDoc.inputRequests;
  const requests = inputRequests.toJSON();
  const idx = requests.findIndex((r: { id: string }) => r.id === requestId);
  if (idx === -1) return;

  const req = inputRequests.get(idx);
  if (req) {
    req.status = status;
  }
  taskDoc.syncPendingRequestsToRoom();
}

function getModalTitle(isBlocker: boolean): string {
  return isBlocker ? 'BLOCKER: Agent needs your input' : 'Agent is requesting input';
}

function getTimeoutTextClass(remainingTime: number): string {
  return remainingTime >= 0 && remainingTime < THRESHOLDS.TIMEOUT_WARNING
    ? 'text-warning'
    : 'text-muted-foreground';
}

interface TimeoutDisplayProps {
  remainingTime: number;
}

function TimeoutDisplay({ remainingTime }: TimeoutDisplayProps) {
  const textClass = getTimeoutTextClass(remainingTime);
  const warningPrefix =
    remainingTime >= 0 && remainingTime < THRESHOLDS.TIMEOUT_WARNING ? '! ' : '';
  return (
    <span className={`text-sm ${textClass}`}>
      {warningPrefix}Timeout: {formatTime(remainingTime)}
    </span>
  );
}

interface ModalHeaderProps {
  isBlocker: boolean;
  taskId?: TaskId;
  showTaskLink?: boolean;
}

function ModalHeader({ isBlocker, taskId, showTaskLink }: ModalHeaderProps) {
  return (
    <Card.Header>
      <div className={`flex items-center ${showTaskLink ? 'justify-between' : ''} gap-2`}>
        <div className="flex items-center gap-2">
          {isBlocker && <AlertOctagon className="w-5 h-5 text-danger shrink-0" />}
          <h2 className="text-xl font-semibold">{getModalTitle(isBlocker)}</h2>
          {isBlocker && (
            <Chip color="danger" variant="primary" size="sm">
              BLOCKER
            </Chip>
          )}
        </div>
        {showTaskLink && taskId && (
          <Link
            href={getTaskRoute(taskId)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-sm text-accent hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Task
          </Link>
        )}
      </div>
    </Card.Header>
  );
}

function renderInputByType(
  request: SingleInputRequest,
  value: string | string[],
  setValue: React.Dispatch<React.SetStateAction<string | string[]>>,
  isSubmitting: boolean,
  customInput: string,
  setCustomInput: React.Dispatch<React.SetStateAction<string>>,
  isOtherSelected: boolean,
  remainingTime: number,
  handleConfirmResponse: (response: string) => void
): React.ReactNode {
  const baseProps = { value, setValue, isSubmitting };

  switch (request.type) {
    case 'text':
      return <TextInput {...baseProps} request={adaptToTextRequest(request)} />;
    case 'multiline':
      return <MultilineInput {...baseProps} request={adaptToMultilineRequest(request)} />;
    case 'choice':
      return (
        <ChoiceInput
          {...baseProps}
          request={adaptToChoiceRequest(request)}
          customInput={customInput}
          setCustomInput={setCustomInput}
          isOtherSelected={isOtherSelected}
        />
      );
    case 'confirm':
      return (
        <ConfirmInput
          {...baseProps}
          request={adaptToConfirmRequest(request)}
          remainingTime={remainingTime}
          onConfirmResponse={handleConfirmResponse}
        />
      );
    case 'number':
      return <NumberInput {...baseProps} request={adaptToNumberRequest(request)} />;
    default:
      return (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>Unsupported Input Type</Alert.Title>
            <Alert.Description>This input type is not supported.</Alert.Description>
          </Alert.Content>
        </Alert>
      );
  }
}

function computeChoiceSelectionState(
  request: SingleInputRequest | null,
  value: string | string[]
): { isOtherSelected: boolean; isNaSelected: boolean } {
  const isOtherSelected =
    request?.type === 'choice' &&
    (Array.isArray(value) ? value.includes(OTHER_OPTION_VALUE) : value === OTHER_OPTION_VALUE);
  const isNaSelected = typeof value === 'string' && value === NA_OPTION_VALUE;
  return { isOtherSelected, isNaSelected };
}

function getBlockerCardClass(isBlocker: boolean): string {
  return isBlocker ? 'border-2 border-danger ring-2 ring-danger/20' : '';
}

function getModalDialogClass(isLarge: boolean): string | undefined {
  return isLarge ? 'sm:max-w-[650px]' : undefined;
}

interface UnauthenticatedModalContentProps {
  request: SingleInputRequest;
  modalConfig: { isLarge: boolean; maxHeight: string | undefined };
  remainingTime: number;
  isSubmitting: boolean;
  onDecline: () => void;
  onSignIn: () => void;
}

function UnauthenticatedModalContent({
  request,
  modalConfig,
  remainingTime,
  isSubmitting,
  onDecline,
  onSignIn,
}: UnauthenticatedModalContentProps) {
  const blockerSuffix = request.isBlocker
    ? ' This is a BLOCKER - the agent cannot proceed without your response.'
    : '';

  return (
    <Card className={getBlockerCardClass(request.isBlocker ?? false)}>
      <ModalHeader isBlocker={request.isBlocker ?? false} />
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
                You need to sign in with GitHub to respond to this request. Your identity will be
                recorded with your response.
                {blockerSuffix}
              </Alert.Description>
            </Alert.Content>
          </Alert>
          <div className="flex justify-between items-center pt-2">
            <TimeoutDisplay remainingTime={remainingTime} />
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
  );
}

interface AuthenticatedModalContentProps {
  request: SingleInputRequest;
  taskId: TaskId;
  value: string | string[];
  setValue: React.Dispatch<React.SetStateAction<string | string[]>>;
  isSubmitting: boolean;
  customInput: string;
  setCustomInput: React.Dispatch<React.SetStateAction<string>>;
  isOtherSelected: boolean;
  isNaSelected: boolean;
  remainingTime: number;
  onSubmit: (e: React.FormEvent) => void;
  onDecline: () => void;
  onConfirmResponse: (response: string) => void;
}

function AuthenticatedModalContent({
  request,
  taskId,
  value,
  setValue,
  isSubmitting,
  customInput,
  setCustomInput,
  isOtherSelected,
  isNaSelected,
  remainingTime,
  onSubmit,
  onDecline,
  onConfirmResponse,
}: AuthenticatedModalContentProps) {
  return (
    <Card className={getBlockerCardClass(request.isBlocker ?? false)}>
      <ModalHeader isBlocker={request.isBlocker ?? false} taskId={taskId} showTaskLink />
      <Card.Content>
        <Form onSubmit={onSubmit} className="space-y-4">
          <div>
            {renderInputByType(
              request,
              value,
              setValue,
              isSubmitting,
              customInput,
              setCustomInput,
              isOtherSelected,
              remainingTime,
              onConfirmResponse
            )}
          </div>
          {request.type !== 'confirm' && (
            <div className="flex justify-between items-center pt-2">
              <TimeoutDisplay remainingTime={remainingTime} />
              <div className="flex gap-2">
                <Button variant="secondary" onPress={onDecline} isDisabled={isSubmitting}>
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
  );
}

export function InputRequestModal({ isOpen, request, taskId, onClose }: InputRequestModalProps) {
  const [value, setValue] = useState<string | string[]>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remainingTime, setRemainingTime] = useState(-1);
  const [customInput, setCustomInput] = useState('');
  const { identity, startAuth } = useGitHubAuth();
  const taskDoc = useTaskDocument(taskId);

  const { isOtherSelected, isNaSelected } = computeChoiceSelectionState(request, value);
  const modalConfig = useMemo(() => getModalConfig(request?.message || ''), [request?.message]);

  useEffect(() => {
    if (request) {
      setValue(getDefaultValueState(request));
      setCustomInput('');
    }
    setRemainingTime(-1);
  }, [request]);

  const handleDecline = useCallback(() => {
    if (!request) return;
    updateRequestStatus(taskDoc, request.id, 'declined');
    setValue(request ? getResetValueState(request) : '');
    onClose();
  }, [request, taskDoc, onClose]);

  const handleCancel = useCallback(() => {
    if (!request) return;
    updateRequestStatus(taskDoc, request.id, 'cancelled');
    setValue(request ? getResetValueState(request) : '');
    onClose();
  }, [request, taskDoc, onClose]);

  useEffect(() => {
    if (!request || !isOpen) return;

    const timeout = Math.floor((request.expiresAt - request.createdAt) / 1000);
    const elapsed = Math.floor((Date.now() - request.createdAt) / 1000);
    setRemainingTime(Math.max(0, timeout - elapsed));

    const interval = setInterval(() => {
      const newElapsed = Math.floor((Date.now() - request.createdAt) / 1000);
      setRemainingTime(Math.max(0, timeout - newElapsed));
    }, INTERVALS.COUNTDOWN_UPDATE);

    return () => clearInterval(interval);
  }, [request, isOpen]);

  useEffect(() => {
    if (remainingTime === 0 && isOpen && request) handleCancel();
  }, [remainingTime, isOpen, request, handleCancel]);

  const answerRequest = useCallback(
    (responseValue: string) => {
      if (!request || !identity) return;

      const inputRequests = taskDoc.inputRequests;
      const requests = inputRequests.toJSON();
      const idx = requests.findIndex((r: { id: string }) => r.id === request.id);
      if (idx !== -1) {
        const req = inputRequests.get(idx);
        if (req) {
          req.status = 'answered';
          req.response = responseValue;
          req.answeredAt = Date.now();
          req.answeredBy = identity.username;
        }
      }
      taskDoc.syncPendingRequestsToRoom();
      taskDoc.logEvent('input_request_answered', identity.username, {
        requestId: request.id,
      });
    },
    [request, identity, taskDoc]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || !identity || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const responseValue = formatResponseValue(
        request,
        value,
        customInput,
        isOtherSelected,
        isNaSelected
      );
      answerRequest(responseValue);
      setValue(getResetValueState(request));
      setCustomInput('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmResponse = useCallback(
    (response: string) => {
      if (!request || !identity || isSubmitting) return;
      setIsSubmitting(true);
      try {
        answerRequest(response);
        setValue(request ? getResetValueState(request) : '');
        onClose();
      } finally {
        setIsSubmitting(false);
      }
    },
    [request, identity, isSubmitting, answerRequest, onClose]
  );

  if (!request) return null;

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      isDismissable={false}
      isKeyboardDismissDisabled={true}
    >
      <Modal.Container placement="center" size="md">
        <Modal.Dialog className={getModalDialogClass(modalConfig.isLarge)}>
          <Modal.CloseTrigger />
          {!identity ? (
            <UnauthenticatedModalContent
              request={request}
              modalConfig={modalConfig}
              remainingTime={remainingTime}
              isSubmitting={isSubmitting}
              onDecline={handleDecline}
              onSignIn={startAuth}
            />
          ) : (
            <AuthenticatedModalContent
              request={request}
              taskId={taskId}
              value={value}
              setValue={setValue}
              isSubmitting={isSubmitting}
              customInput={customInput}
              setCustomInput={setCustomInput}
              isOtherSelected={isOtherSelected}
              isNaSelected={isNaSelected}
              remainingTime={remainingTime}
              onSubmit={handleSubmit}
              onDecline={handleDecline}
              onConfirmResponse={handleConfirmResponse}
            />
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
