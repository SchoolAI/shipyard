import { SearchField } from '@heroui/react';
import { type ForwardedRef, forwardRef, useImperativeHandle, useRef } from 'react';

interface SearchPlanInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-label': string;
  className?: string;
}

export interface SearchPlanInputHandle {
  focus: () => void;
}

export const SearchPlanInput = forwardRef(function SearchPlanInput(
  {
    value,
    onChange,
    placeholder = 'Search...',
    'aria-label': ariaLabel,
    className,
  }: SearchPlanInputProps,
  ref: ForwardedRef<SearchPlanInputHandle>
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
  }));

  return (
    <SearchField
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      onClear={() => onChange('')}
      className={className}
    >
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input ref={inputRef} placeholder={placeholder} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
});
