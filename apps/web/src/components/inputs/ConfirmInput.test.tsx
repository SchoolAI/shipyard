/**
 * Tests for ConfirmInput component.
 *
 * Verifies:
 * - Renders message text
 * - Yes/No/Explain buttons are present and accessible
 * - onConfirmResponse is called with correct value
 * - Timeout display and warning state
 * - Disabled state during submission
 * - Explain mode shows text input and submit/back buttons
 * - Custom response is submitted correctly
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmInput } from './ConfirmInput';
import type { ConfirmInputRequest } from './types';

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

  it('should render Yes, No, and Explain buttons', () => {
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
    expect(screen.getByRole('button', { name: 'Explain...' })).toBeInTheDocument();
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
        remainingTime={125}
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
        remainingTime={-1}
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
    expect(screen.getByRole('button', { name: 'Explain...' })).toBeDisabled();
  });

  describe('Explain mode', () => {
    it('should show text input when Explain is clicked', async () => {
      const user = userEvent.setup();
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

      await user.click(screen.getByRole('button', { name: 'Explain...' }));

      expect(screen.getByText('Please explain:')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type your answer...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });

    it('should hide Yes/No/Explain buttons in explain mode', async () => {
      const user = userEvent.setup();
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

      await user.click(screen.getByRole('button', { name: 'Explain...' }));

      expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'No' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Explain...' })).not.toBeInTheDocument();
    });

    it('should return to button view when Back is clicked', async () => {
      const user = userEvent.setup();
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

      await user.click(screen.getByRole('button', { name: 'Explain...' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));

      expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Explain...' })).toBeInTheDocument();
    });

    it('should disable Submit when text input is empty', async () => {
      const user = userEvent.setup();
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

      await user.click(screen.getByRole('button', { name: 'Explain...' }));

      expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    });

    it('should disable Submit when text input is only whitespace', async () => {
      const user = userEvent.setup();
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

      await user.click(screen.getByRole('button', { name: 'Explain...' }));
      await user.type(screen.getByPlaceholderText('Type your answer...'), '   ');

      expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    });

    it('should enable Submit when text input has content', async () => {
      const user = userEvent.setup();
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

      await user.click(screen.getByRole('button', { name: 'Explain...' }));
      await user.type(
        screen.getByPlaceholderText('Type your answer...'),
        'Yes, but only to staging'
      );

      expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
    });

    it('should call onConfirmResponse with custom text when Submit is clicked', async () => {
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

      await user.click(screen.getByRole('button', { name: 'Explain...' }));
      await user.type(
        screen.getByPlaceholderText('Type your answer...'),
        'Yes, but only to staging first'
      );
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onConfirmResponse).toHaveBeenCalledTimes(1);
      expect(onConfirmResponse).toHaveBeenCalledWith('Yes, but only to staging first');
    });

    it('should trim whitespace from custom response', async () => {
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

      await user.click(screen.getByRole('button', { name: 'Explain...' }));
      await user.type(screen.getByPlaceholderText('Type your answer...'), '  Custom answer  ');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onConfirmResponse).toHaveBeenCalledWith('Custom answer');
    });

    it('should clear text input when Back is clicked', async () => {
      const user = userEvent.setup();
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

      await user.click(screen.getByRole('button', { name: 'Explain...' }));
      await user.type(screen.getByPlaceholderText('Type your answer...'), 'Some text');
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Explain...' }));

      expect(screen.getByPlaceholderText('Type your answer...')).toHaveValue('');
    });

    it('should still show timeout in explain mode', async () => {
      const user = userEvent.setup();
      const request = createConfirmRequest();

      render(
        <ConfirmInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          remainingTime={90}
          onConfirmResponse={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Explain...' }));

      expect(screen.getByText(/Timeout: 1:30/)).toBeInTheDocument();
    });

    it('should disable Back and Submit when isSubmitting in explain mode', async () => {
      const user = userEvent.setup();
      const request = createConfirmRequest();

      const { rerender } = render(
        <ConfirmInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          remainingTime={120}
          onConfirmResponse={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Explain...' }));
      await user.type(screen.getByPlaceholderText('Type your answer...'), 'Some text');

      rerender(
        <ConfirmInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={true}
          remainingTime={120}
          onConfirmResponse={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    });
  });
});
