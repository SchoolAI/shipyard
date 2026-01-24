/**
 * Tests for ConfirmInput component.
 *
 * Verifies:
 * - Renders message text
 * - Yes/No buttons are present and accessible
 * - onConfirmResponse is called with correct value
 * - Timeout display and warning state
 * - Disabled state during submission
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmInput } from './ConfirmInput';
import type { ConfirmInputRequest } from './types';

// Factory for creating test requests
function createConfirmRequest(overrides: Partial<ConfirmInputRequest> = {}): ConfirmInputRequest {
  return {
    id: 'test-id',
    type: 'confirm',
    message: 'Do you want to proceed?',
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('ConfirmInput', () => {
  it('should render the message', () => {
    const request = createConfirmRequest({ message: 'Are you sure?' });
    render(
      <ConfirmInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        remainingTime={120}
        onConfirmResponse={vi.fn()}
      />
    );

    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('should render Yes and No buttons', () => {
    const request = createConfirmRequest();
    render(
      <ConfirmInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        remainingTime={120}
        onConfirmResponse={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('should call onConfirmResponse with "yes" when Yes is clicked', async () => {
    const user = userEvent.setup();
    const onConfirmResponse = vi.fn();
    const request = createConfirmRequest();

    render(
      <ConfirmInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        remainingTime={120}
        onConfirmResponse={onConfirmResponse}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(onConfirmResponse).toHaveBeenCalledTimes(1);
    expect(onConfirmResponse).toHaveBeenCalledWith('yes');
  });

  it('should call onConfirmResponse with "no" when No is clicked', async () => {
    const user = userEvent.setup();
    const onConfirmResponse = vi.fn();
    const request = createConfirmRequest();

    render(
      <ConfirmInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        remainingTime={120}
        onConfirmResponse={onConfirmResponse}
      />
    );

    await user.click(screen.getByRole('button', { name: 'No' }));

    expect(onConfirmResponse).toHaveBeenCalledTimes(1);
    expect(onConfirmResponse).toHaveBeenCalledWith('no');
  });

  it('should display formatted timeout', () => {
    const request = createConfirmRequest();
    render(
      <ConfirmInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        remainingTime={125} // 2:05
        onConfirmResponse={vi.fn()}
      />
    );

    expect(screen.getByText(/Timeout: 2:05/)).toBeInTheDocument();
  });

  it('should show warning style when timeout is low (under 30s)', () => {
    const request = createConfirmRequest();
    render(
      <ConfirmInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        remainingTime={25}
        onConfirmResponse={vi.fn()}
      />
    );

    // When < 30s, an exclamation mark is prepended
    expect(screen.getByText(/! Timeout:/)).toBeInTheDocument();
  });

  it('should not show warning when timeout is 30s or more', () => {
    const request = createConfirmRequest();
    render(
      <ConfirmInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        remainingTime={30}
        onConfirmResponse={vi.fn()}
      />
    );

    // No exclamation mark when >= 30s
    expect(screen.queryByText(/! Timeout:/)).not.toBeInTheDocument();
  });

  it('should display "--:--" for uninitialized timeout', () => {
    const request = createConfirmRequest();
    render(
      <ConfirmInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        remainingTime={-1} // Sentinel for uninitialized
        onConfirmResponse={vi.fn()}
      />
    );

    expect(screen.getByText(/Timeout: --:--/)).toBeInTheDocument();
  });

  it('should disable buttons when isSubmitting is true', () => {
    const request = createConfirmRequest();
    render(
      <ConfirmInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={true}
        remainingTime={120}
        onConfirmResponse={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'No' })).toBeDisabled();
  });
});
