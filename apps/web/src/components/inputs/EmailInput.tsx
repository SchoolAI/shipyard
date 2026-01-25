/**
 * Email input component for input requests.
 * Supports domain restriction and email format validation.
 */

import { Input, TextField } from '@heroui/react';
import type { EmailInputRequest } from '@shipyard/schema';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import type { BaseInputProps } from './types';

/** Basic email validation regex */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate an email address format and optional domain restriction.
 */
function isValidEmail(email: string, domain?: string): boolean {
  if (!EMAIL_REGEX.test(email)) return false;
  if (domain && !email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
    return false;
  }
  return true;
}

export function EmailInput({
  request,
  value,
  setValue,
  isSubmitting,
}: BaseInputProps<EmailInputRequest>) {
  const emailValue = typeof value === 'string' ? value : '';
  const hasValue = emailValue.trim() !== '';
  const isValid = !hasValue || isValidEmail(emailValue, request.domain);

  const getErrorMessage = (): string | null => {
    if (!hasValue || isValid) return null;
    if (request.domain) {
      return `Please enter a valid @${request.domain} email address`;
    }
    return 'Please enter a valid email address';
  };

  const errorMessage = getErrorMessage();
  const placeholder = request.domain ? `you@${request.domain}` : 'you@example.com';

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <MarkdownContent content={request.message} variant="default" />
        <TextField isRequired isDisabled={isSubmitting} isInvalid={hasValue && !isValid}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={emailValue}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            aria-invalid={hasValue && !isValid}
            aria-describedby={errorMessage ? 'email-error' : undefined}
          />
          {errorMessage && (
            <p id="email-error" className="text-xs text-danger mt-1" role="alert">
              {errorMessage}
            </p>
          )}
        </TextField>
      </div>
    </div>
  );
}
