/**
 * Multi-line text input component for input requests.
 */

import { Label, TextArea, TextField } from '@heroui/react';
import type { BaseInputProps, MultilineInputRequest } from './types';

export function MultilineInput({
  request,
  value,
  setValue,
  isSubmitting,
}: BaseInputProps<MultilineInputRequest>) {
  const textValue = typeof value === 'string' ? value : '';

  return (
    <div className="space-y-3">
      <TextField isRequired isDisabled={isSubmitting}>
        <Label className="text-sm font-medium text-foreground">{request.message}</Label>
        <TextArea
          value={textValue}
          onChange={(e) => setValue(e.target.value)}
          placeholder={request.defaultValue}
          rows={4}
          autoFocus
        />
      </TextField>
      <p className="text-xs text-muted-foreground">{textValue.length} characters</p>
    </div>
  );
}
