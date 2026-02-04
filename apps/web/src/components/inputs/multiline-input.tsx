import { TextArea, TextField } from '@heroui/react';
import { MarkdownContent } from '@/components/ui/markdown-content';
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
      <div className="space-y-1">
        <MarkdownContent content={request.message} variant="default" />
        <TextField isRequired isDisabled={isSubmitting}>
          <TextArea
            value={textValue}
            onChange={(e) => setValue(e.target.value)}
            placeholder={request.defaultValue ?? undefined}
            rows={4}
            autoFocus
          />
        </TextField>
      </div>
      <p className="text-xs text-muted-foreground">{textValue.length} characters</p>
    </div>
  );
}
