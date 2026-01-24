/**
 * Tests for ChoiceInput component.
 *
 * Verifies:
 * - Renders message and options
 * - Single-select with radio buttons
 * - Multi-select with checkboxes
 * - "Other" escape hatch option
 * - Error state for empty options
 * - Accessibility (radiogroup/group roles)
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceInput } from './ChoiceInput';
import type { ChoiceInputRequest } from './types';
import { OTHER_OPTION_VALUE } from './utils';

// Factory for creating test requests
function createChoiceRequest(overrides: Partial<ChoiceInputRequest> = {}): ChoiceInputRequest {
  return {
    id: 'test-id',
    type: 'choice',
    message: 'Select an option',
    status: 'pending',
    createdAt: Date.now(),
    options: ['Option A', 'Option B', 'Option C'],
    ...overrides,
  };
}

describe('ChoiceInput', () => {
  describe('Single-select mode (radio buttons)', () => {
    it('should render the message', () => {
      const request = createChoiceRequest({ message: 'Choose your preference' });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      expect(screen.getByText('Choose your preference')).toBeInTheDocument();
    });

    it('should render all options as radio buttons', () => {
      const request = createChoiceRequest({
        options: ['Red', 'Green', 'Blue'],
      });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
      expect(screen.getByText('Red')).toBeInTheDocument();
      expect(screen.getByText('Green')).toBeInTheDocument();
      expect(screen.getByText('Blue')).toBeInTheDocument();
    });

    it('should call setValue when an option is selected', async () => {
      const user = userEvent.setup();
      const setValue = vi.fn();
      const request = createChoiceRequest({
        options: ['Apple', 'Banana'],
      });

      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={setValue}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      // Click on the Banana label/radio
      await user.click(screen.getByText('Banana'));

      expect(setValue).toHaveBeenCalledWith('Banana');
    });

    it('should render "Other" escape hatch option', () => {
      const request = createChoiceRequest();
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      expect(screen.getByText('Other (please specify)')).toBeInTheDocument();
    });

    it('should show custom input field when "Other" is selected', () => {
      const request = createChoiceRequest();
      render(
        <ChoiceInput
          request={request}
          value={OTHER_OPTION_VALUE}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={true}
        />
      );

      expect(screen.getByPlaceholderText('Type your answer...')).toBeInTheDocument();
    });

    it('should call setCustomInput when typing in other field', async () => {
      const user = userEvent.setup();
      const setCustomInput = vi.fn();
      const request = createChoiceRequest();

      render(
        <ChoiceInput
          request={request}
          value={OTHER_OPTION_VALUE}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={setCustomInput}
          isOtherSelected={true}
        />
      );

      const otherInput = screen.getByPlaceholderText('Type your answer...');
      await user.type(otherInput, 'Custom');

      expect(setCustomInput).toHaveBeenCalled();
    });

    it('should be disabled when isSubmitting is true', () => {
      const request = createChoiceRequest({ options: ['A', 'B'] });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={true}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      // RadioGroup should be disabled
      const radiogroup = screen.getByRole('radiogroup');
      expect(radiogroup).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Multi-select mode (checkboxes)', () => {
    it('should render checkboxes when multiSelect is true', () => {
      const request = createChoiceRequest({
        options: ['Cat', 'Dog', 'Bird'],
        multiSelect: true,
      });
      render(
        <ChoiceInput
          request={request}
          value={[]}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      // Should have checkboxgroup not radiogroup
      expect(screen.getByRole('group')).toBeInTheDocument();
      expect(screen.getByText('(Select one or more options)')).toBeInTheDocument();
    });

    it('should render all options with checkboxes', () => {
      const request = createChoiceRequest({
        options: ['Cat', 'Dog'],
        multiSelect: true,
      });
      render(
        <ChoiceInput
          request={request}
          value={[]}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      expect(screen.getByText('Cat')).toBeInTheDocument();
      expect(screen.getByText('Dog')).toBeInTheDocument();
      expect(screen.getByText('Other (please specify)')).toBeInTheDocument();
    });

    it('should allow selecting multiple options', async () => {
      const user = userEvent.setup();
      const setValue = vi.fn();
      const request = createChoiceRequest({
        options: ['X', 'Y', 'Z'],
        multiSelect: true,
      });

      render(
        <ChoiceInput
          request={request}
          value={['X']}
          setValue={setValue}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      // Click on Y
      await user.click(screen.getByText('Y'));

      // Should be called with both X and Y
      expect(setValue).toHaveBeenCalled();
    });
  });

  describe('Object options (rich format)', () => {
    it('should render object options with labels', () => {
      const request = createChoiceRequest({
        options: [
          { value: 'opt1', label: 'First Option' },
          { value: 'opt2', label: 'Second Option', description: 'More details' },
        ],
      });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      expect(screen.getByText('First Option')).toBeInTheDocument();
      expect(screen.getByText('Second Option')).toBeInTheDocument();
      expect(screen.getByText('More details')).toBeInTheDocument();
    });

    it('should handle disabled options', () => {
      const request = createChoiceRequest({
        options: [
          { value: 'enabled', label: 'Enabled' },
          { value: 'disabled', label: 'Disabled', disabled: true },
        ],
      });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  describe('Error states', () => {
    it('should show error alert when options array is empty', () => {
      const request = createChoiceRequest({ options: [] });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      expect(screen.getByText('Invalid Request')).toBeInTheDocument();
      expect(screen.getByText(/no options available/)).toBeInTheDocument();
    });
  });

  describe('Auto-switching UI (dropdown for 9+ options)', () => {
    it('should render radio buttons for 8 or fewer options', () => {
      const request = createChoiceRequest({
        options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      // Should render as radiogroup, not combobox
      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('should render dropdown (combobox) for 9+ options', () => {
      const request = createChoiceRequest({
        options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
      });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      // Should render as combobox
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should force dropdown when displayAs="dropdown"', () => {
      const request = createChoiceRequest({
        options: ['A', 'B', 'C'],
        displayAs: 'dropdown',
      });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      // Should render as combobox even with few options
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should show placeholder in dropdown mode', () => {
      const request = createChoiceRequest({
        options: Array.from({ length: 10 }, (_, i) => `Option ${i + 1}`),
        placeholder: 'Pick an option...',
      });
      render(
        <ChoiceInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveAttribute('placeholder', 'Pick an option...');
    });

    it('should NOT auto-switch to dropdown for multiSelect (checkboxes)', () => {
      const request = createChoiceRequest({
        options: Array.from({ length: 10 }, (_, i) => `Option ${i + 1}`),
        multiSelect: true,
      });
      render(
        <ChoiceInput
          request={request}
          value={[]}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
        />
      );

      // Should render as checkboxgroup, not combobox
      expect(screen.getByRole('group')).toBeInTheDocument();
    });
  });
});
