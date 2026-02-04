/**
 * Tests for DateInput component.
 *
 * Verifies:
 * - Renders message as label
 * - Date input renders correctly
 * - Min/max date range validation
 * - Error messages for out-of-range dates
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateInput } from './DateInput';
import type { DateInputRequest } from './types';

function createDateRequest(overrides: Partial<DateInputRequest> = {}): DateInputRequest {
  return {
    id: 'test-id',
    type: 'date',
    message: 'Select a date',
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('DateInput', () => {
  it('should render with message as label', () => {
    const request = createDateRequest({ message: 'When is your birthday?' });
    render(<DateInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    expect(screen.getByText('When is your birthday?')).toBeInTheDocument();
  });

  it('should render a date input', () => {
    const request = createDateRequest();
    render(<DateInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    const input = document.querySelector('input[type="date"]');
    expect(input).toBeInTheDocument();
  });

  it('should call setValue when date changes', async () => {
    const user = userEvent.setup();
    const setValue = vi.fn();
    const request = createDateRequest();

    render(<DateInput request={request} value="" setValue={setValue} isSubmitting={false} />);

    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '2024-06-15');

    expect(setValue).toHaveBeenCalled();
  });

  it('should display current value', () => {
    const request = createDateRequest();
    render(
      <DateInput request={request} value="2024-01-15" setValue={vi.fn()} isSubmitting={false} />
    );

    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.value).toBe('2024-01-15');
  });

  it('should not show error for empty value', () => {
    const request = createDateRequest({ min: '2024-01-01', max: '2024-12-31' });
    render(<DateInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should show error when date is before minimum', () => {
    const request = createDateRequest({ min: '2024-06-01' });
    render(
      <DateInput request={request} value="2024-05-15" setValue={vi.fn()} isSubmitting={false} />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please select a date on or after 2024-06-01'
    );
  });

  it('should show error when date is after maximum', () => {
    const request = createDateRequest({ max: '2024-06-30' });
    render(
      <DateInput request={request} value="2024-07-15" setValue={vi.fn()} isSubmitting={false} />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please select a date on or before 2024-06-30'
    );
  });

  it('should show combined error when both min and max specified but date out of range', () => {
    const request = createDateRequest({ min: '2024-01-01', max: '2024-12-31' });
    render(
      <DateInput request={request} value="2023-06-15" setValue={vi.fn()} isSubmitting={false} />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please select a date between 2024-01-01 and 2024-12-31'
    );
  });

  it('should not show error for valid date within range', () => {
    const request = createDateRequest({ min: '2024-01-01', max: '2024-12-31' });
    render(
      <DateInput request={request} value="2024-06-15" setValue={vi.fn()} isSubmitting={false} />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should set min and max attributes on input', () => {
    const request = createDateRequest({ min: '2024-01-01', max: '2024-12-31' });
    render(<DateInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toHaveAttribute('min', '2024-01-01');
    expect(input).toHaveAttribute('max', '2024-12-31');
  });

  it('should set aria-invalid when date is invalid', () => {
    const request = createDateRequest({ min: '2024-06-01' });
    render(
      <DateInput request={request} value="2024-05-01" setValue={vi.fn()} isSubmitting={false} />
    );

    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('should be disabled when isSubmitting is true', () => {
    const request = createDateRequest();
    render(<DateInput request={request} value="" setValue={vi.fn()} isSubmitting={true} />);

    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('should handle non-string value gracefully', () => {
    const request = createDateRequest();
    render(
      <DateInput
        request={request}
        // biome-ignore lint/suspicious/noExplicitAny: Testing edge case with invalid value type
        value={['array'] as any}
        setValue={vi.fn()}
        isSubmitting={false}
      />
    );

    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
