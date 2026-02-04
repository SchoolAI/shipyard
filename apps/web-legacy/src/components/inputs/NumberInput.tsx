/**
 * Number input component for input requests.
 * Supports min/max bounds with step derived from format.
 */

import { Input, TextField } from '@heroui/react';
import type { NumberInputRequest } from '@shipyard/schema';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import type { BaseInputProps } from './types';

export function NumberInput({
  request,
  value,
  setValue,
  isSubmitting,
}: BaseInputProps<NumberInputRequest>) {
  const numValue = typeof value === 'string' ? value : '';

  const step = request.format === 'integer' ? 1 : 0.01;

  const parsedNum = numValue ? Number.parseFloat(numValue) : Number.NaN;
  const hasValue = numValue !== '';

  const isBelowMin =
    hasValue && !Number.isNaN(parsedNum) && request.min !== undefined && parsedNum < request.min;
  const isAboveMax =
    hasValue && !Number.isNaN(parsedNum) && request.max !== undefined && parsedNum > request.max;
  const isInvalidNumber = hasValue && Number.isNaN(parsedNum);
  const isValid = !isInvalidNumber && !isBelowMin && !isAboveMax;

  const getErrorMessage = (): string | null => {
    if (!hasValue) return null;
    if (isInvalidNumber) return 'Please enter a valid number';
    if (isBelowMin && isAboveMax) {
      return `Must be between ${request.min} and ${request.max}`;
    }
    if (isBelowMin) return `Must be at least ${request.min}`;
    if (isAboveMax) return `Must be at most ${request.max}`;
    return null;
  };

  const errorMessage = getErrorMessage();

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <MarkdownContent content={request.message} variant="default" />
        <TextField isRequired isDisabled={isSubmitting} isInvalid={hasValue && !isValid}>
          <Input
            type="number"
            inputMode={
              request.format === 'decimal' || request.format === 'currency' ? 'decimal' : 'numeric'
            }
            value={numValue}
            onChange={(e) => setValue(e.target.value)}
            min={request.min}
            max={request.max}
            step={step}
            autoComplete="off"
            autoFocus
            aria-invalid={hasValue && !isValid}
          />
          {errorMessage && (
            <p className="text-xs text-danger mt-1" role="alert">
              {errorMessage}
            </p>
          )}
        </TextField>
      </div>
    </div>
  );
}
