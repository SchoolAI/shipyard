/**
 * Tests for EmailInput component.
 *
 * Verifies:
 * - Renders message as label
 * - Email validation (format)
 * - Domain restriction validation
 * - Error messages display
 * - Correct input attributes (type, inputMode)
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmailInput } from './EmailInput';
import type { EmailInputRequest } from './types';

function createEmailRequest(overrides: Partial<EmailInputRequest> = {}): EmailInputRequest {
  return {
    id: 'test-id',
    type: 'email',
    message: 'Enter your email',
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('EmailInput', () => {
  it('should render with message as label', () => {
    const request = createEmailRequest({ message: 'Your work email' });
    render(<EmailInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    expect(screen.getByText('Your work email')).toBeInTheDocument();
  });

  it('should render an email input with correct attributes', () => {
    const request = createEmailRequest();
    render(<EmailInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('inputMode', 'email');
    expect(input).toHaveAttribute('autoComplete', 'email');
  });

  it('should call setValue when user types', async () => {
    const user = userEvent.setup();
    const setValue = vi.fn();
    const request = createEmailRequest();

    render(<EmailInput request={request} value="" setValue={setValue} isSubmitting={false} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ab');

    expect(setValue).toHaveBeenCalledTimes(2);
    expect(setValue).toHaveBeenNthCalledWith(1, 'a');
    expect(setValue).toHaveBeenNthCalledWith(2, 'b');
  });

  it('should show default placeholder when no domain specified', () => {
    const request = createEmailRequest();
    render(<EmailInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'you@example.com');
  });

  it('should show domain-specific placeholder when domain is specified', () => {
    const request = createEmailRequest({ domain: 'company.com' });
    render(<EmailInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'you@company.com');
  });

  it('should not show error for empty value', () => {
    const request = createEmailRequest();
    render(<EmailInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should show error for invalid email format', () => {
    const request = createEmailRequest();
    render(
      <EmailInput request={request} value="not-an-email" setValue={vi.fn()} isSubmitting={false} />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address');
  });

  it('should not show error for valid email', () => {
    const request = createEmailRequest();
    render(
      <EmailInput
        request={request}
        value="user@example.com"
        setValue={vi.fn()}
        isSubmitting={false}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should show domain-specific error when domain restriction fails', () => {
    const request = createEmailRequest({ domain: 'company.com' });
    render(
      <EmailInput
        request={request}
        value="user@other.com"
        setValue={vi.fn()}
        isSubmitting={false}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter a valid @company.com email address'
    );
  });

  it('should accept email matching domain restriction', () => {
    const request = createEmailRequest({ domain: 'company.com' });
    render(
      <EmailInput
        request={request}
        value="user@company.com"
        setValue={vi.fn()}
        isSubmitting={false}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should handle case-insensitive domain matching', () => {
    const request = createEmailRequest({ domain: 'Company.COM' });
    render(
      <EmailInput
        request={request}
        value="user@company.com"
        setValue={vi.fn()}
        isSubmitting={false}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should set aria-invalid when email is invalid', () => {
    const request = createEmailRequest();
    render(
      <EmailInput request={request} value="invalid" setValue={vi.fn()} isSubmitting={false} />
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('should be disabled when isSubmitting is true', () => {
    const request = createEmailRequest();
    render(<EmailInput request={request} value="" setValue={vi.fn()} isSubmitting={true} />);

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });
});
