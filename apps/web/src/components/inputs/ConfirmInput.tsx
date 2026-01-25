/**
 * Confirm input component for yes/no input requests.
 * Displays the message with Yes/No/Explain buttons and countdown timer.
 * The "Explain" button reveals a text input for qualified responses.
 */

import { Button, Label, TextArea, TextField } from '@heroui/react';
import { useState } from 'react';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import type { ConfirmInputProps } from './types';
import { formatTime } from './utils';

export function ConfirmInput({
  request,
  isSubmitting,
  remainingTime,
  onConfirmResponse,
}: ConfirmInputProps) {
  const [showExplain, setShowExplain] = useState(false);
  const [customResponse, setCustomResponse] = useState('');

  const handleBack = () => {
    setShowExplain(false);
    setCustomResponse('');
  };

  return (
    <div className="space-y-4">
      <MarkdownContent content={request.message} variant="default" />

      {showExplain ? (
        <div className="space-y-3">
          <TextField isDisabled={isSubmitting}>
            <Label className="text-sm font-medium text-foreground">Please explain:</Label>
            <TextArea
              value={customResponse}
              onChange={(e) => setCustomResponse(e.target.value)}
              placeholder="Type your answer..."
              rows={3}
              autoFocus
            />
          </TextField>
          <div className="flex justify-between items-center pt-2">
            <span
              className={`text-sm ${remainingTime >= 0 && remainingTime < 30 ? 'text-warning' : 'text-muted-foreground'}`}
            >
              {remainingTime >= 0 && remainingTime < 30 && '! '}Timeout: {formatTime(remainingTime)}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onPress={handleBack} isDisabled={isSubmitting}>
                Back
              </Button>
              <Button
                onPress={() => onConfirmResponse(customResponse.trim())}
                isDisabled={isSubmitting || !customResponse.trim()}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-between items-center pt-2">
          <span
            className={`text-sm ${remainingTime >= 0 && remainingTime < 30 ? 'text-warning' : 'text-muted-foreground'}`}
          >
            {remainingTime >= 0 && remainingTime < 30 && '! '}Timeout: {formatTime(remainingTime)}
          </span>
          <div className="flex gap-2">
            <Button
              onPress={() => onConfirmResponse('no')}
              variant="secondary"
              isDisabled={isSubmitting}
            >
              No
            </Button>
            <Button onPress={() => onConfirmResponse('yes')} isDisabled={isSubmitting}>
              Yes
            </Button>
            <Button onPress={() => setShowExplain(true)} variant="ghost" isDisabled={isSubmitting}>
              Explain...
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
