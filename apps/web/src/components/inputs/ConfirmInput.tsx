/**
 * Confirm input component for yes/no input requests.
 * Displays the message with Yes/No buttons and countdown timer.
 */

import { Button } from '@heroui/react';
import type { ConfirmInputProps } from './types';
import { formatTime } from './utils';

export function ConfirmInput({
  request,
  isSubmitting,
  remainingTime,
  onConfirmResponse,
}: ConfirmInputProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">{request.message}</p>
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
        </div>
      </div>
    </div>
  );
}
