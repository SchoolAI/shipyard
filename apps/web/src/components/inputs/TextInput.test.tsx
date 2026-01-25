/**
 * Tests for TextInput component.
 *
 * Verifies:
 * - Renders message as label
 * - Calls setValue on input change
 * - Respects disabled state during submission
 * - Accessibility (textbox role, label association)
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextInput } from './TextInput';
import type { TextInputRequest } from './types';

function createTextRequest(overrides: Partial<TextInputRequest> = {}): TextInputRequest {
  return {
    id: 'test-id',
    type: 'text',
    message: 'Enter your name',
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('TextInput', () => {
  it('should render with message as label', () => {
    const request = createTextRequest({ message: 'What is your favorite color?' });
    render(<TextInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    expect(screen.getByText('What is your favorite color?')).toBeInTheDocument();
  });

  it('should render an accessible textbox', () => {
    const request = createTextRequest();
    render(<TextInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should call setValue when user types', async () => {
    const user = userEvent.setup();
    const setValue = vi.fn();
    const request = createTextRequest();

    render(<TextInput request={request} value="" setValue={setValue} isSubmitting={false} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'John');

    expect(setValue).toHaveBeenCalledTimes(4);
    expect(setValue).toHaveBeenNthCalledWith(1, 'J');
    expect(setValue).toHaveBeenNthCalledWith(2, 'o');
    expect(setValue).toHaveBeenNthCalledWith(3, 'h');
    expect(setValue).toHaveBeenNthCalledWith(4, 'n');
  });

  it('should display current value in the input', () => {
    const request = createTextRequest();
    render(
      <TextInput request={request} value="existing value" setValue={vi.fn()} isSubmitting={false} />
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('existing value');
  });

  it('should show defaultValue as placeholder', () => {
    const request = createTextRequest({ defaultValue: 'Type here...' });
    render(<TextInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Type here...');
  });

  it('should be disabled when isSubmitting is true', () => {
    const request = createTextRequest();
    render(<TextInput request={request} value="" setValue={vi.fn()} isSubmitting={true} />);

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('should handle non-string value gracefully', () => {
    const request = createTextRequest();
    render(
      <TextInput
        request={request}
        // biome-ignore lint/suspicious/noExplicitAny: Testing edge case with invalid value type
        value={['array', 'value'] as any}
        setValue={vi.fn()}
        isSubmitting={false}
      />
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('');
  });
});
