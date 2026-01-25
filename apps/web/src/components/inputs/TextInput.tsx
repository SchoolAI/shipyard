/**
 * Single-line text input component for input requests.
 */

import { Input, TextField } from '@heroui/react';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import type { BaseInputProps, TextInputRequest } from './types';

export function TextInput({
  request,
  value,
  setValue,
  isSubmitting,
}: BaseInputProps<TextInputRequest>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <MarkdownContent content={request.message} variant="default" />
        <TextField isRequired isDisabled={isSubmitting}>
          <Input
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setValue(e.target.value)}
            placeholder={request.defaultValue}
            autoFocus
          />
        </TextField>
      </div>
    </div>
  );
}
