/**
 * Modal component for responding to agent input requests.
 * Displays different input types (text, multiline, choice, confirm) with countdown timer.
 * Updates Y.Doc with user response or cancellation.
 */

import {
  Alert,
  Button,
  Card,
  Checkbox,
  CheckboxGroup,
  Form,
  Input,
  Modal,
  Radio,
  RadioGroup,
  TextArea,
  TextField,
} from '@heroui/react';
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';

interface InputRequestModalProps {
  isOpen: boolean;
  request: InputRequest | null;
  ydoc: Y.Doc | null;
  onClose: () => void;
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

  // Complex content gets larger modal with scroll
  if (hasCodeBlock || hasTable || lineCount > 15 || charCount > 800) {
    return { isLarge: true, maxHeight: '400px' };
  }
  // Medium content gets scroll if needed
  if (lineCount > 8 || charCount > 400) {
    return { isLarge: false, maxHeight: '300px' };
  }
  // Simple content - no special handling
  return { isLarge: false, maxHeight: undefined };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Modal with multiple input types and auth states naturally has branching logic
export function InputRequestModal({ isOpen, request, ydoc, onClose }: InputRequestModalProps) {
  const [value, setValue] = useState<string | string[]>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Use -1 as sentinel value to indicate "not yet initialized"
  // This prevents race condition where auto-cancel fires before countdown is set
  const [remainingTime, setRemainingTime] = useState(-1);
  const { identity, startAuth } = useGitHubAuth();

  // Calculate modal config based on message complexity
  const modalConfig = useMemo(() => getModalConfig(request?.message || ''), [request?.message]);

  // Reset state when request changes
  useEffect(() => {
    if (request) {
      // multiSelect only exists on 'choice' type requests
      if (request.type === 'choice' && request.multiSelect) {
        setValue(request.defaultValue ? [request.defaultValue] : []);
      } else {
        setValue(request.defaultValue || '');
      }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ydoc || !request || !identity || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Convert array values (from multiSelect choice) to comma-separated string
      const responseValue = Array.isArray(value) ? value.join(', ') : value;
      const result = answerInputRequest(ydoc, request.id, responseValue, identity.username);

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
  };

  const formatTime = (seconds: number) => {
    // Handle sentinel value (-1 = not yet initialized)
    if (seconds < 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Input type switching with form validation requires comprehensive handling
  const renderInput = () => {
    if (!request) return null;

    switch (request.type) {
      case 'text':
        return (
          <div className="space-y-3">
            <MarkdownContent content={request.message} maxHeight={modalConfig.maxHeight} />
            <TextField isRequired isDisabled={isSubmitting}>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={request.defaultValue}
                autoFocus
              />
            </TextField>
          </div>
        );

      case 'multiline':
        return (
          <div className="space-y-3">
            <MarkdownContent content={request.message} maxHeight={modalConfig.maxHeight} />
            <TextField isRequired isDisabled={isSubmitting}>
              <TextArea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={request.defaultValue}
                rows={4}
                autoFocus
              />
            </TextField>
            <p className="text-xs text-muted-foreground">{value.length} characters</p>
          </div>
        );

      case 'choice': {
        const options = request.options || [];
        if (options.length === 0) {
          return (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Invalid Request</Alert.Title>
                <Alert.Description>
                  This choice request has no options available. Please cancel and contact the agent.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          );
        }

        // Multi-select mode with checkboxes
        if (request.multiSelect) {
          return (
            <div className="space-y-3">
              <MarkdownContent content={request.message} maxHeight={modalConfig.maxHeight} />
              <p className="text-xs text-muted-foreground">(Select one or more options)</p>
              <CheckboxGroup
                isRequired
                value={Array.isArray(value) ? value : []}
                onChange={setValue}
                isDisabled={isSubmitting}
              >
                {options.map((opt) => (
                  <Checkbox key={opt} value={opt}>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Checkbox.Content>
                      <MarkdownContent content={opt} variant="minimal" />
                    </Checkbox.Content>
                  </Checkbox>
                ))}
              </CheckboxGroup>
            </div>
          );
        }

        // Single-select mode with radio buttons
        return (
          <div className="space-y-3">
            <MarkdownContent content={request.message} maxHeight={modalConfig.maxHeight} />
            <RadioGroup
              isRequired
              value={typeof value === 'string' ? value : ''}
              onChange={setValue}
              isDisabled={isSubmitting}
            >
              {options.map((opt) => (
                <Radio key={opt} value={opt}>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  <Radio.Content>
                    <MarkdownContent content={opt} variant="minimal" />
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>
          </div>
        );
      }

      case 'confirm':
        return (
          <div className="space-y-4">
            <MarkdownContent content={request.message} maxHeight={modalConfig.maxHeight} />
            <div className="flex justify-between items-center pt-2">
              <span
                className={`text-sm ${remainingTime >= 0 && remainingTime < 30 ? 'text-warning' : 'text-muted-foreground'}`}
              >
                {remainingTime >= 0 && remainingTime < 30 && '⚠️ '}Timeout:{' '}
                {formatTime(remainingTime)}
              </span>
              <div className="flex gap-2">
                <Button
                  onPress={() => handleConfirmResponse('no')}
                  variant="secondary"
                  isDisabled={isSubmitting}
                >
                  No
                </Button>
                <Button onPress={() => handleConfirmResponse('yes')} isDisabled={isSubmitting}>
                  Yes
                </Button>
              </div>
            </div>
          </div>
        );

      default: {
        // Exhaustive check - TypeScript will error if new type added without case
        const _exhaustiveCheck: never = request;
        return _exhaustiveCheck;
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
          <Modal.Dialog className={modalConfig.isLarge ? 'sm:max-w-[650px]' : undefined}>
            <Modal.CloseTrigger />

            <Card>
              <Card.Header>
                <h2 className="text-xl font-semibold">Agent is requesting input</h2>
              </Card.Header>

              <Card.Content>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Agent is asking:</p>
                    <MarkdownContent content={request.message} maxHeight={modalConfig.maxHeight} />
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
                      {remainingTime >= 0 && remainingTime < 30 && '⚠️ '}Timeout:{' '}
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
                      {remainingTime >= 0 && remainingTime < 30 && '⚠️ '}Timeout:{' '}
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
                          (Array.isArray(value) ? value.length === 0 : !value) ||
                          (request.type === 'choice' && !request.options?.length)
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
