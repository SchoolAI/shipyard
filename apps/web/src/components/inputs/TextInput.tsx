/**
 * Single-line text input component for input requests.
 */

import { Input, Label, TextField } from '@heroui/react';
import type { BaseInputProps, TextInputRequest } from './types';

export function TextInput({
  request,
  value,
  setValue,
  isSubmitting,
}: BaseInputProps<TextInputRequest>) {
  return (
    <div className="space-y-3">
      <TextField isRequired isDisabled={isSubmitting}>
        <Label className="text-sm font-medium text-foreground">{request.message}</Label>
        <Input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setValue(e.target.value)}
          placeholder={request.defaultValue}
          autoFocus
        />
      </TextField>
    </div>
  );
}
