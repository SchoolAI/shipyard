/**
 * Rating input component for input requests.
 * Uses RadioGroup pattern for accessibility compliance.
 * Features cumulative left-to-right fill with hover preview.
 * Includes N/A and "Other" escape hatch options.
 */

import { Button, Input, Label, Radio, RadioGroup, TextField } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import type { RatingInputProps } from './types';
import { NA_OPTION_LABEL, NA_OPTION_VALUE, OTHER_OPTION_VALUE } from './utils';

/**
 * Get the display icon/label for a rating value based on style.
 * For emoji style, falls back to numbers if the scale is too large (> 5 items).
 * For stars, uses filled (★) or empty (☆) based on whether it's filled.
 */
function getRatingDisplay(
  rating: number,
  style: string,
  minVal: number,
  maxVal: number,
  isFilled: boolean
): string {
  if (style === 'stars') {
    return isFilled ? '\u2605' : '\u2606'; // Filled star (★) or empty star (☆)
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

  // Handle escape hatch button clicks
  const handleNaClick = () => {
    setValue(NA_OPTION_VALUE);
  };

  const handleOtherClick = () => {
    setValue(OTHER_OPTION_VALUE);
  };

  return (
    <div className="space-y-3">
      <RadioGroup
        value={selectedValue}
        onChange={(val) => setValue(val as string)}
        isDisabled={isSubmitting}
        isRequired
        orientation="horizontal"
      >
        <Label className="text-sm font-medium text-foreground">{request.message}</Label>

        {/* Stars and buttons on same line */}
        <div className="flex items-center gap-4 justify-center flex-wrap">
          <div className="flex gap-1">
            {ratingValues.map((rating) => {
              // Cumulative fill: all ratings <= displayValue are filled
              const isFilled = rating <= displayValue;
              const displayChar = getRatingDisplay(rating, style, minVal, maxVal, isFilled);

              return (
                <Radio key={rating} value={String(rating)}>
                  <Radio.Control className="sr-only" />
                  <Radio.Content>
                    {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Mouse events for hover preview; Radio handles the actual interaction */}
                    <span
                      className={`
                        text-2xl cursor-pointer transition-all
                        hover:scale-110
                        ${isFilled ? 'opacity-100' : 'opacity-50'}
                        ${style === 'stars' ? (isFilled ? 'text-yellow-500' : 'text-gray-300') : ''}
                        ${style === 'numbers' && isFilled ? 'font-bold' : ''}
                      `}
                      role="img"
                      aria-label={`${rating} out of ${maxVal}`}
                      onMouseEnter={() => setHoveredRating(rating)}
                      onMouseLeave={() => setHoveredRating(null)}
                      onFocus={() => setHoveredRating(rating)}
                      onBlur={() => setHoveredRating(null)}
                    >
                      {displayChar}
                    </span>
                  </Radio.Content>
                </Radio>
              );
            })}
          </div>

          {/* Escape hatch buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isNaSelected ? 'primary' : 'secondary'}
              onPress={handleNaClick}
              isDisabled={isSubmitting}
            >
              {NA_OPTION_LABEL}
            </Button>
            <Button
              size="sm"
              variant={isOtherSelected ? 'primary' : 'secondary'}
              onPress={handleOtherClick}
              isDisabled={isSubmitting}
            >
              Other...
            </Button>
          </div>
        </div>

        {request.labels && (
          <div className="flex justify-between text-xs text-muted-foreground pt-1 w-full">
            <span>{request.labels.low || ''}</span>
            <span>{request.labels.high || ''}</span>
          </div>
        )}
      </RadioGroup>

      {/* Custom text input for "Other" option */}
      {isOtherSelected && (
        <TextField>
          <Label className="text-sm text-muted-foreground">Why can't you rate this?</Label>
          <Input
            ref={customInputRef}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Explain..."
            disabled={isSubmitting}
          />
        </TextField>
      )}
    </div>
  );
}
