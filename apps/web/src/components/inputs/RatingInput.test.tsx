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
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RatingInput } from './RatingInput';
import type { RatingInputRequest } from './types';

// Factory for creating test requests
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

describe('RatingInput', () => {
  it('should render with message as label', () => {
    const request = createRatingRequest({ message: 'How satisfied are you?' });
    render(<RatingInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    expect(screen.getByText('How satisfied are you?')).toBeInTheDocument();
  });

  it('should render as a radiogroup for accessibility', () => {
    const request = createRatingRequest();
    render(<RatingInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('should render default 5 rating options (1-5)', () => {
    const request = createRatingRequest();
    render(<RatingInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    // Check for 5 options with aria-labels indicating rating values
    expect(screen.getByLabelText('1 out of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('2 out of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('3 out of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('4 out of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('5 out of 5')).toBeInTheDocument();
  });

  it('should render custom rating range', () => {
    const request = createRatingRequest({ min: 1, max: 10 });
    render(<RatingInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    // Check first and last options
    expect(screen.getByLabelText('1 out of 10')).toBeInTheDocument();
    expect(screen.getByLabelText('10 out of 10')).toBeInTheDocument();
  });

  it('should call setValue when a rating is selected', async () => {
    const user = userEvent.setup();
    const setValue = vi.fn();
    const request = createRatingRequest();

    render(<RatingInput request={request} value="" setValue={setValue} isSubmitting={false} />);

    // Click on rating 4
    await user.click(screen.getByLabelText('4 out of 5'));

    expect(setValue).toHaveBeenCalledWith('4');
  });

  it('should display stars style by default', () => {
    const request = createRatingRequest();
    render(<RatingInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    // Stars are rendered as the filled star character
    const stars = screen.getAllByText('\u2605'); // Unicode filled star
    expect(stars.length).toBe(5);
  });

  it('should display numbers when style is "numbers"', () => {
    const request = createRatingRequest({ style: 'numbers' });
    render(<RatingInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    // Numbers should be displayed
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('should display emoji when style is "emoji"', () => {
    const request = createRatingRequest({ style: 'emoji', min: 1, max: 5 });
    render(<RatingInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    // Emojis range from sad to happy
    expect(screen.getByText('\ud83d\ude1e')).toBeInTheDocument(); // Sad
    expect(screen.getByText('\ud83d\ude04')).toBeInTheDocument(); // Happy
  });

  it('should display scale labels when provided', () => {
    const request = createRatingRequest({
      labels: {
        low: 'Poor',
        high: 'Excellent',
      },
    });
    render(<RatingInput request={request} value="" setValue={vi.fn()} isSubmitting={false} />);

    expect(screen.getByText('Poor')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('should highlight selected rating', () => {
    const request = createRatingRequest();
    render(<RatingInput request={request} value="3" setValue={vi.fn()} isSubmitting={false} />);

    // The selected rating should have full opacity while others are reduced
    const ratingElements = screen.getAllByRole('img');
    const rating3 = ratingElements[2]; // Index 2 = rating 3
    expect(rating3).toHaveClass('opacity-100');
  });

  it('should be disabled when isSubmitting is true', () => {
    const request = createRatingRequest();
    render(<RatingInput request={request} value="" setValue={vi.fn()} isSubmitting={true} />);

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
      />
    );

    // Should render without crashing
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });
});
