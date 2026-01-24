/**
 * Rating input component for input requests.
 * Uses RadioGroup pattern for accessibility compliance.
 */

import { Label, Radio, RadioGroup } from '@heroui/react';
import type { RatingInputRequest } from '@shipyard/schema';
import type { BaseInputProps } from './types';

/**
 * Get the display icon/label for a rating value based on style.
 * For emoji style, falls back to numbers if the scale is too large (> 5 items).
 */
function getRatingDisplay(rating: number, style: string, minVal: number, maxVal: number): string {
  if (style === 'stars') return '\u2605'; // Filled star
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
}: BaseInputProps<RatingInputRequest>) {
  const minVal = request.min ?? 1;
  const maxVal = request.max ?? 5;
  const style = request.style ?? 'stars';
  const selectedValue = typeof value === 'string' ? value : '';

  // Generate rating values array
  const ratingValues = Array.from({ length: maxVal - minVal + 1 }, (_, i) => minVal + i);

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

        <div className="flex items-center gap-1 pt-2">
          {ratingValues.map((rating) => {
            const isSelected = selectedValue === String(rating);
            const displayValue = getRatingDisplay(rating, style, minVal, maxVal);

            return (
              <Radio key={rating} value={String(rating)}>
                <Radio.Control className="sr-only" />
                <Radio.Content>
                  <span
                    className={`
                      text-2xl cursor-pointer transition-transform
                      hover:scale-110
                      ${isSelected ? 'opacity-100' : 'opacity-50'}
                      ${style === 'stars' ? (isSelected ? 'text-yellow-500' : 'text-gray-300') : ''}
                    `}
                    role="img"
                    aria-label={`${rating} out of ${maxVal}`}
                  >
                    {displayValue}
                  </span>
                </Radio.Content>
              </Radio>
            );
          })}
        </div>

        {request.labels && (
          <div className="flex justify-between text-xs text-muted-foreground pt-1 w-full">
            <span>{request.labels.low || ''}</span>
            <span>{request.labels.high || ''}</span>
          </div>
        )}
      </RadioGroup>
    </div>
  );
}
