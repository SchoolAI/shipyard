/**
 * Number input component for input requests.
 * Supports min/max bounds, step increments, and unit labels.
 */

import { Input, Label, TextField } from '@heroui/react';
import type { NumberInputRequest } from '@shipyard/schema';
import type { BaseInputProps } from './types';

export function NumberInput({
  request,
  value,
  setValue,
  isSubmitting,
}: BaseInputProps<NumberInputRequest>) {
  const numValue = typeof value === 'string' ? value : '';

  // Parse current value for validation
  const parsedNum = numValue ? Number.parseFloat(numValue) : Number.NaN;
  const hasValue = numValue !== '';

  // Validate bounds
  const isBelowMin =
    hasValue && !Number.isNaN(parsedNum) && request.min !== undefined && parsedNum < request.min;
  const isAboveMax =
    hasValue && !Number.isNaN(parsedNum) && request.max !== undefined && parsedNum > request.max;
  const isInvalidNumber = hasValue && Number.isNaN(parsedNum);
  const isValid = !isInvalidNumber && !isBelowMin && !isAboveMax;

  // Build error message
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
      <TextField isRequired isDisabled={isSubmitting} isInvalid={hasValue && !isValid}>
        <Label className="text-sm font-medium text-foreground">{request.message}</Label>
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            inputMode={
              request.format === 'decimal' || request.format === 'currency' ? 'decimal' : 'numeric'
            }
            value={numValue}
            onChange={(e) => setValue(e.target.value)}
            min={request.min}
            max={request.max}
            step={request.step ?? (request.format === 'integer' ? 1 : 0.01)}
            autoFocus
            aria-describedby={request.unit ? 'number-unit' : undefined}
            aria-invalid={hasValue && !isValid}
          />
          {request.unit && (
            <span id="number-unit" className="text-sm text-muted-foreground whitespace-nowrap">
              {request.unit}
            </span>
          )}
        </div>
        {errorMessage && (
          <p className="text-xs text-danger mt-1" role="alert">
            {errorMessage}
          </p>
        )}
      </TextField>
    </div>
  );
}
