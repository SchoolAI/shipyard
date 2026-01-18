/**
 * Modal component for responding to agent input requests.
 * Displays different input types (text, multiline, choice, confirm) with countdown timer.
 * Updates Y.Doc with user response or cancellation.
 */

import {
  Alert,
  Button,
  Form,
  Input,
  Label,
  Modal,
  Radio,
  RadioGroup,
  TextArea,
  TextField,
} from '@heroui/react';
import type { InputRequest } from '@peer-plan/schema';
import { YDOC_KEYS } from '@peer-plan/schema';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { assertNever } from '@/utils/assert-never';

interface InputRequestModalProps {
  isOpen: boolean;
  request: InputRequest | null;
  ydoc: Y.Doc | null;
  onClose: () => void;
}

export function InputRequestModal({ isOpen, request, ydoc, onClose }: InputRequestModalProps) {
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const { identity, startAuth } = useGitHubAuth();

  // Reset value when request changes
  useEffect(() => {
    if (request) {
      setValue(request.defaultValue || '');
    }
  }, [request]);

  const handleCancel = useCallback(() => {
    if (!ydoc || !request) return;

    ydoc.transact(() => {
      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      const requests = requestsArray.toJSON() as InputRequest[];
      const index = requests.findIndex((r) => r.id === request.id);

      if (index !== -1) {
        requestsArray.delete(index, 1);
        requestsArray.insert(index, [
          {
            ...request,
            status: 'cancelled',
          },
        ]);
      }
    });

    setValue('');
    onClose();
  }, [ydoc, request, onClose]);

  // Countdown timer - calculate from createdAt
  useEffect(() => {
    if (!request || !isOpen) return;

    const timeout = request.timeout || 300; // default 5 min
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
      // Track if transaction actually performed an update
      let wasUpdated = false;

      ydoc.transact(() => {
        const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
        const requests = requestsArray.toJSON() as InputRequest[];
        const index = requests.findIndex((r) => r.id === request.id);

        if (index !== -1) {
          const currentRequest = requests[index];
          if (!currentRequest) return;

          // Check if request is still pending to avoid race condition
          if (currentRequest.status !== 'pending') {
            return;
          }

          requestsArray.delete(index, 1);
          requestsArray.insert(index, [
            {
              ...request,
              status: 'answered',
              response: value,
              answeredAt: Date.now(),
              answeredBy: identity.username,
            },
          ]);

          wasUpdated = true;
        }
      });

      // Only close modal and clear value if update succeeded
      if (wasUpdated) {
        setValue('');
        onClose();
      } else {
        // Show toast indicating race condition
        toast.error('This request was already answered by another user');
        // Keep modal open so user can see the message and close manually
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleConfirmResponse = useCallback(
    (response: 'yes' | 'no') => {
      if (!ydoc || !request || !identity || isSubmitting) return;

      setIsSubmitting(true);

      try {
        // Track if transaction actually performed an update
        let wasUpdated = false;

        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const requests = requestsArray.toJSON() as InputRequest[];
          const index = requests.findIndex((r) => r.id === request.id);

          if (index !== -1) {
            const currentRequest = requests[index];
            if (!currentRequest) return;

            // Check if request is still pending to avoid race condition
            if (currentRequest.status !== 'pending') {
              return;
            }

            requestsArray.delete(index, 1);
            requestsArray.insert(index, [
              {
                ...request,
                status: 'answered',
                response,
                answeredAt: Date.now(),
                answeredBy: identity.username,
              },
            ]);

            wasUpdated = true;
          }
        });

        // Only close modal and clear value if update succeeded
        if (wasUpdated) {
          setValue('');
          onClose();
        } else {
          // Show toast indicating race condition
          toast.error('This request was already answered by another user');
          // Keep modal open so user can see the message and close manually
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [ydoc, request, identity, isSubmitting, onClose]
  );

  const renderInput = () => {
    if (!request) return null;

    switch (request.type) {
      case 'text':
        return (
          <TextField isRequired isDisabled={isSubmitting}>
            <Label>{request.message}</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={request.defaultValue}
              autoFocus
            />
          </TextField>
        );

      case 'multiline':
        return (
          <TextField isRequired isDisabled={isSubmitting}>
            <Label>{request.message}</Label>
            <TextArea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={request.defaultValue}
              rows={4}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">{value.length} characters</p>
          </TextField>
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

        return (
          <RadioGroup isRequired value={value} onChange={setValue} isDisabled={isSubmitting}>
            <Label>{request.message}</Label>
            {options.map((opt) => (
              <Radio key={opt} value={opt}>
                {opt}
              </Radio>
            ))}
          </RadioGroup>
        );
      }

      case 'confirm':
        return (
          <div className="space-y-4">
            <p className="text-foreground">{request.message}</p>
            <div className="flex gap-2 justify-end">
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
        );

      default:
        return assertNever(request.type);
    }
  };

  if (!request) return null;

  // Show sign-in prompt if no identity
  if (!identity) {
    return (
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => !open && handleCancel()}
        isDismissable={!isSubmitting}
        isKeyboardDismissDisabled={isSubmitting}
      >
        <Modal.Container placement="center" size="md">
          <Modal.Dialog>
            <Modal.CloseTrigger />

            <Modal.Header>
              <Modal.Heading>Agent is requesting input</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="space-y-4">
              <div className="space-y-3">
                <p className="text-foreground">
                  <strong>Agent is asking:</strong>
                </p>
                <p className="text-foreground">{request.message}</p>
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
              </div>
            </Modal.Body>

            <Modal.Footer className="flex justify-between items-center">
              <span
                className={`text-sm ${remainingTime < 30 ? 'text-warning' : 'text-muted-foreground'}`}
              >
                {remainingTime < 30 && '⚠️ '}Timeout: {formatTime(remainingTime)}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onPress={handleCancel} isDisabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onPress={() => startAuth()}>Sign in with GitHub</Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );
  }

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleCancel()}
      isDismissable={!isSubmitting}
      isKeyboardDismissDisabled={isSubmitting}
    >
      <Modal.Container placement="center" size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />

          <Modal.Header>
            <Modal.Heading>Agent is requesting input</Modal.Heading>
          </Modal.Header>

          <Form onSubmit={handleSubmit}>
            <Modal.Body className="space-y-4">{renderInput()}</Modal.Body>

            {request.type !== 'confirm' && (
              <Modal.Footer className="flex justify-between items-center">
                <span
                  className={`text-sm ${remainingTime < 30 ? 'text-warning' : 'text-muted-foreground'}`}
                >
                  {remainingTime < 30 && '⚠️ '}Timeout: {formatTime(remainingTime)}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" onPress={handleCancel} isDisabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isDisabled={
                      isSubmitting ||
                      !value ||
                      (request.type === 'choice' && !request.options?.length)
                    }
                    isPending={isSubmitting}
                  >
                    Submit
                  </Button>
                </div>
              </Modal.Footer>
            )}
          </Form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
