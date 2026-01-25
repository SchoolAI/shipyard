/**
 * Rating input component for input requests.
 * Uses HeroUI RadioGroup pattern for accessibility compliance.
 * Features cumulative left-to-right fill with hover preview.
 * Includes N/A and "Other" escape hatch options.
 */

import { Input, Label, Radio, RadioGroup, TextField } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import type { RatingInputProps } from './types';
import { NA_OPTION_LABEL, NA_OPTION_VALUE, OTHER_OPTION_VALUE } from './utils';

/** Rating-specific label for "Other" option (shorter than ChoiceInput's version) */
const RATING_OTHER_LABEL = 'Other...';

/**
 * Get the display icon/label for a rating value based on style.
 * For emoji style, falls back to numbers if the scale is too large (> 5 items).
 * For stars, uses filled (star) or empty (star outline) based on whether it's filled.
 */
function getRatingDisplay(
  rating: number,
  style: string,
  minVal: number,
  maxVal: number,
  isFilled: boolean
): string {
  if (style === 'stars') {
    return isFilled ? '\u2605' : '\u2606'; // Filled star or empty star
  }
  if (style === 'emoji') {
    // Disable emoji for large scales (e.g., NPS 0-10)
    if (maxVal - minVal > 4) {
      return String(rating); // Fallback to numbers
    }
    const emojis = ['\ud83d\ude1e', '\ud83d\ude15', '\ud83d\ude10', '\ud83d\ude42', '\ud83d\ude04']; // Sad to happy
    const index = rating - minVal;
    return emojis[Math.max(0, Math.min(index, emojis.length - 1))] ?? '\ud83d\ude10';
  }
  return String(rating);
}

export function RatingInput({
  request,
  value,
  setValue,
  isSubmitting,
  customInput,
  setCustomInput,
  isOtherSelected,
  isNaSelected,
}: RatingInputProps) {
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const minVal = request.min ?? 1;
  const maxVal = request.max ?? 5;
  const style = request.style ?? 'stars';
  const selectedValue = typeof value === 'string' ? value : '';

  // Auto-focus custom input when "Other" is selected
  useEffect(() => {
    if (isOtherSelected && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [isOtherSelected]);

  // Parse selected value for cumulative fill calculation
  // If escape hatch is selected, nothing should be filled
  const selectedNumber =
    selectedValue && !isOtherSelected && !isNaSelected ? Number.parseInt(selectedValue, 10) : 0;
  // Display value is hover preview or selected value (0 means nothing filled)
  const displayValue = hoveredRating ?? selectedNumber;

  // Generate rating values array
  const ratingValues = Array.from({ length: maxVal - minVal + 1 }, (_, i) => minVal + i);

  // Custom text input for "Other" option (shared pattern from ChoiceInput)
  const otherInputField = isOtherSelected && (
    <TextField className="mt-3">
      <Label className="text-sm text-muted-foreground">Why can't you rate this?</Label>
      <Input
        ref={customInputRef}
        value={customInput}
        onChange={(e) => setCustomInput(e.target.value)}
        placeholder="Explain..."
        disabled={isSubmitting}
      />
    </TextField>
  );

  return (
    <div className="space-y-3">
      <MarkdownContent content={request.message} variant="default" />
      <RadioGroup
        value={selectedValue}
        onChange={(val) => setValue(val as string)}
        isDisabled={isSubmitting}
        orientation="horizontal"
      >
        {/* Rating values displayed horizontally */}
        <div className="flex items-center gap-1 justify-center">
          {ratingValues.map((rating) => {
            // Cumulative fill: all ratings <= displayValue are filled
            const isFilled = rating <= displayValue;
            const displayChar = getRatingDisplay(rating, style, minVal, maxVal, isFilled);

            return (
              <Radio
                key={rating}
                value={String(rating)}
                className="cursor-pointer"
                onHoverStart={() => setHoveredRating(rating)}
                onHoverEnd={() => setHoveredRating(null)}
              >
                <Radio.Control className="sr-only">
                  <Radio.Indicator />
                </Radio.Control>
                <Radio.Content>
                  <span
                    className={`
                      text-2xl cursor-pointer transition-all select-none
                      hover:scale-110
                      ${isFilled ? 'opacity-100' : 'opacity-50'}
                      ${style === 'stars' ? (isFilled ? 'text-yellow-500' : 'text-gray-300') : ''}
                      ${style === 'numbers' && isFilled ? 'font-bold' : ''}
                    `}
                    role="img"
                    aria-label={`${rating} out of ${maxVal}`}
                  >
                    {displayChar}
                  </span>
                </Radio.Content>
              </Radio>
            );
          })}
        </div>

        {/* Labels for rating scale endpoints */}
        {request.labels && (
          <div className="flex justify-between text-xs text-muted-foreground pt-1 w-full">
            <span>{request.labels.low || ''}</span>
            <span>{request.labels.high || ''}</span>
          </div>
        )}

        {/* Escape hatch options - N/A and Other with custom button-like styling */}
        <div className="flex gap-2 justify-center mt-2">
          <Radio value={NA_OPTION_VALUE}>
            <Radio.Control className="sr-only">
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <span
                className={`px-3 py-1 rounded text-sm cursor-pointer transition-colors ${
                  isNaSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {NA_OPTION_LABEL}
              </span>
            </Radio.Content>
          </Radio>
          <Radio value={OTHER_OPTION_VALUE}>
            <Radio.Control className="sr-only">
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <span
                className={`px-3 py-1 rounded text-sm cursor-pointer transition-colors ${
                  isOtherSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {RATING_OTHER_LABEL}
              </span>
            </Radio.Content>
          </Radio>
        </div>
      </RadioGroup>

      {otherInputField}
    </div>
  );
}
