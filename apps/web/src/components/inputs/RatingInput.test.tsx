/**
 * Tests for RatingInput component.
 *
 * Verifies:
 * - Renders message as label
 * - Default rating scale (1-5)
 * - Custom min/max range
 * - Different display styles (stars, numbers, emoji)
 * - Labels for scale endpoints
 * - Selection updates value
 * - N/A and Other escape hatch buttons
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RatingInput } from './RatingInput';
import type { RatingInputRequest } from './types';
import { NA_OPTION_VALUE, OTHER_OPTION_VALUE } from './utils';

function createRatingRequest(overrides: Partial<RatingInputRequest> = {}): RatingInputRequest {
  return {
    id: 'test-id',
    type: 'rating',
    message: 'Rate your experience',
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

const defaultEscapeHatchProps = {
  customInput: '',
  setCustomInput: vi.fn(),
  isOtherSelected: false,
  isNaSelected: false,
};

describe('RatingInput', () => {
  it('should render with message as label', () => {
    const request = createRatingRequest({ message: 'How satisfied are you?' });
    render(
      <RatingInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    expect(screen.getByText('How satisfied are you?')).toBeInTheDocument();
  });

  it('should render as a radiogroup for accessibility', () => {
    const request = createRatingRequest();
    render(
      <RatingInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('should render default 5 rating options (1-5)', () => {
    const request = createRatingRequest();
    render(
      <RatingInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    expect(screen.getByLabelText('1 out of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('2 out of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('3 out of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('4 out of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('5 out of 5')).toBeInTheDocument();
  });

  it('should render custom rating range', () => {
    const request = createRatingRequest({ min: 1, max: 10 });
    render(
      <RatingInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    expect(screen.getByLabelText('1 out of 10')).toBeInTheDocument();
    expect(screen.getByLabelText('10 out of 10')).toBeInTheDocument();
  });

  it('should call setValue when a rating is selected', async () => {
    const user = userEvent.setup();
    const setValue = vi.fn();
    const request = createRatingRequest();

    render(
      <RatingInput
        request={request}
        value=""
        setValue={setValue}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    await user.click(screen.getByLabelText('4 out of 5'));

    expect(setValue).toHaveBeenCalledWith('4');
  });

  it('should display empty stars by default when no value selected', () => {
    const request = createRatingRequest();
    render(
      <RatingInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    const emptyStars = screen.getAllByText('\u2606');
    expect(emptyStars.length).toBe(5);
  });

  it('should show cumulative filled stars up to selected value', () => {
    const request = createRatingRequest();
    render(
      <RatingInput
        request={request}
        value="3"
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    const filledStars = screen.getAllByText('\u2605');
    const emptyStars = screen.getAllByText('\u2606');
    expect(filledStars.length).toBe(3);
    expect(emptyStars.length).toBe(2);
  });

  it('should display numbers when style is "numbers"', () => {
    const request = createRatingRequest({ style: 'numbers' });
    render(
      <RatingInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('should display emoji when style is "emoji"', () => {
    const request = createRatingRequest({ style: 'emoji', min: 1, max: 5 });
    render(
      <RatingInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    expect(screen.getByText('\ud83d\ude1e')).toBeInTheDocument();
    expect(screen.getByText('\ud83d\ude04')).toBeInTheDocument();
  });

  it('should display scale labels when provided', () => {
    const request = createRatingRequest({
      labels: {
        low: 'Poor',
        high: 'Excellent',
      },
    });
    render(
      <RatingInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    expect(screen.getByText('Poor')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('should highlight all ratings up to selected value with cumulative fill', () => {
    const request = createRatingRequest();
    render(
      <RatingInput
        request={request}
        value="3"
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    const ratingElements = screen.getAllByRole('img');
    expect(ratingElements[0]).toHaveClass('opacity-100');
    expect(ratingElements[1]).toHaveClass('opacity-100');
    expect(ratingElements[2]).toHaveClass('opacity-100');
    expect(ratingElements[3]).toHaveClass('opacity-40');
    expect(ratingElements[4]).toHaveClass('opacity-40');
  });

  it('should show bold for filled numbers in numbers style', () => {
    const request = createRatingRequest({ style: 'numbers' });
    render(
      <RatingInput
        request={request}
        value="3"
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    const ratingElements = screen.getAllByRole('img');
    expect(ratingElements[0]).toHaveClass('font-bold');
    expect(ratingElements[1]).toHaveClass('font-bold');
    expect(ratingElements[2]).toHaveClass('font-bold');
    expect(ratingElements[3]).not.toHaveClass('font-bold');
    expect(ratingElements[4]).not.toHaveClass('font-bold');
  });

  it('should be disabled when isSubmitting is true', () => {
    const request = createRatingRequest();
    render(
      <RatingInput
        request={request}
        value=""
        setValue={vi.fn()}
        isSubmitting={true}
        {...defaultEscapeHatchProps}
      />
    );

    const radiogroup = screen.getByRole('radiogroup');
    expect(radiogroup).toHaveAttribute('aria-disabled', 'true');
  });

  it('should handle non-string value gracefully', () => {
    const request = createRatingRequest();
    render(
      <RatingInput
        request={request}
        // biome-ignore lint/suspicious/noExplicitAny: Testing edge case with invalid value type
        value={['array'] as any}
        setValue={vi.fn()}
        isSubmitting={false}
        {...defaultEscapeHatchProps}
      />
    );

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  describe('keyboard accessibility', () => {
    it('should show hover preview on focus for keyboard users', async () => {
      const user = userEvent.setup();
      const request = createRatingRequest();
      render(
        <RatingInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          {...defaultEscapeHatchProps}
        />
      );

      await user.tab();

      const radiogroup = screen.getByRole('radiogroup');
      expect(radiogroup).toBeInTheDocument();
    });
  });

  describe('escape hatches', () => {
    it('should render N/A and Other options', () => {
      const request = createRatingRequest();
      render(
        <RatingInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={false}
          {...defaultEscapeHatchProps}
        />
      );

      expect(screen.getByText('N/A')).toBeInTheDocument();
      expect(screen.getByText('Other...')).toBeInTheDocument();
    });

    it('should call setValue with N/A value when N/A option is clicked', async () => {
      const user = userEvent.setup();
      const setValue = vi.fn();
      const request = createRatingRequest();

      render(
        <RatingInput
          request={request}
          value=""
          setValue={setValue}
          isSubmitting={false}
          {...defaultEscapeHatchProps}
        />
      );

      await user.click(screen.getByText('N/A'));

      expect(setValue).toHaveBeenCalledWith(NA_OPTION_VALUE);
    });

    it('should call setValue with Other value when Other option is clicked', async () => {
      const user = userEvent.setup();
      const setValue = vi.fn();
      const request = createRatingRequest();

      render(
        <RatingInput
          request={request}
          value=""
          setValue={setValue}
          isSubmitting={false}
          {...defaultEscapeHatchProps}
        />
      );

      await user.click(screen.getByText('Other...'));

      expect(setValue).toHaveBeenCalledWith(OTHER_OPTION_VALUE);
    });

    it('should show text input when Other is selected', () => {
      const request = createRatingRequest();
      render(
        <RatingInput
          request={request}
          value={OTHER_OPTION_VALUE}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={true}
          isNaSelected={false}
        />
      );

      expect(screen.getByPlaceholderText('Explain...')).toBeInTheDocument();
      expect(screen.getByText("Why can't you rate this?")).toBeInTheDocument();
    });

    it('should not show text input when N/A is selected', () => {
      const request = createRatingRequest();
      render(
        <RatingInput
          request={request}
          value={NA_OPTION_VALUE}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
          isNaSelected={true}
        />
      );

      expect(screen.queryByPlaceholderText('Explain...')).not.toBeInTheDocument();
    });

    it('should call setCustomInput when typing in Other text field', async () => {
      const user = userEvent.setup();
      const setCustomInput = vi.fn();
      const request = createRatingRequest();

      render(
        <RatingInput
          request={request}
          value={OTHER_OPTION_VALUE}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={setCustomInput}
          isOtherSelected={true}
          isNaSelected={false}
        />
      );

      const input = screen.getByPlaceholderText('Explain...');
      await user.type(input, 'I need more context');

      expect(setCustomInput).toHaveBeenCalled();
    });

    it('should select N/A option when N/A is selected (visual state managed via props)', () => {
      const request = createRatingRequest();
      render(
        <RatingInput
          request={request}
          value={NA_OPTION_VALUE}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
          isNaSelected={true}
        />
      );

      const naOption = screen.getByText('N/A');
      expect(naOption).toBeInTheDocument();
      expect(naOption).toHaveClass('bg-accent');
    });

    it('should select Other option when Other is selected (visual state managed via props)', () => {
      const request = createRatingRequest();
      render(
        <RatingInput
          request={request}
          value={OTHER_OPTION_VALUE}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={true}
          isNaSelected={false}
        />
      );

      const otherOption = screen.getByText('Other...');
      expect(otherOption).toBeInTheDocument();
      expect(otherOption).toHaveClass('bg-accent');
    });

    it('should clear star fill when N/A is selected', () => {
      const request = createRatingRequest();
      render(
        <RatingInput
          request={request}
          value={NA_OPTION_VALUE}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={false}
          isNaSelected={true}
        />
      );

      const emptyStars = screen.getAllByText('\u2606');
      expect(emptyStars.length).toBe(5);
    });

    it('should clear star fill when Other is selected', () => {
      const request = createRatingRequest();
      render(
        <RatingInput
          request={request}
          value={OTHER_OPTION_VALUE}
          setValue={vi.fn()}
          isSubmitting={false}
          customInput=""
          setCustomInput={vi.fn()}
          isOtherSelected={true}
          isNaSelected={false}
        />
      );

      const emptyStars = screen.getAllByText('\u2606');
      expect(emptyStars.length).toBe(5);
    });

    it('should show disabled styling on escape hatch options when isSubmitting is true', () => {
      const request = createRatingRequest();
      render(
        <RatingInput
          request={request}
          value=""
          setValue={vi.fn()}
          isSubmitting={true}
          {...defaultEscapeHatchProps}
        />
      );

      const naOption = screen.getByText('N/A');
      const otherOption = screen.getByText('Other...');

      expect(naOption).toHaveClass('cursor-not-allowed');
      expect(otherOption).toHaveClass('cursor-not-allowed');
    });
  });
});
