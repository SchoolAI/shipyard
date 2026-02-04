/**
 * Date input component for input requests.
 * Uses native HTML5 date picker with optional min/max range validation.
 */

import { Input, TextField } from '@heroui/react';
import type { DateInputRequest } from '@shipyard/schema';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import type { BaseInputProps } from './types';

export function DateInput({
  request,
  value,
  setValue,
  isSubmitting,
}: BaseInputProps<DateInputRequest>) {
  const dateValue = typeof value === 'string' ? value : '';
  const hasValue = dateValue !== '';

  const isDateValid = (): boolean => {
    if (!hasValue) return true;
    const date = new Date(dateValue);
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
  };

  const isValid = isDateValid();

  const getErrorMessage = (): string | null => {
    if (!hasValue || isValid) return null;
    if (request.min && request.max) {
      return `Please select a date between ${request.min} and ${request.max}`;
    }
    if (request.min) {
      return `Please select a date on or after ${request.min}`;
    }
    if (request.max) {
      return `Please select a date on or before ${request.max}`;
    }
    return 'Please enter a valid date';
  };

  const errorMessage = getErrorMessage();

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <MarkdownContent content={request.message} variant="default" />
        <TextField isRequired isDisabled={isSubmitting} isInvalid={hasValue && !isValid}>
          <Input
            type="date"
            value={dateValue}
            onChange={(e) => setValue(e.target.value)}
            min={request.min}
            max={request.max}
            autoComplete="off"
            autoFocus
            aria-invalid={hasValue && !isValid}
            aria-describedby={errorMessage ? 'date-error' : undefined}
          />
          {errorMessage && (
            <p id="date-error" className="text-xs text-danger mt-1" role="alert">
              {errorMessage}
            </p>
          )}
        </TextField>
      </div>
    </div>
  );
}
