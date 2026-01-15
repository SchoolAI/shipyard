import { SearchField } from '@heroui/react';

interface SearchPlanInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-label': string;
  className?: string;
}

/**
 * Shared search input component for filtering plans.
 * Used in Sidebar, Inbox page, and Archive page.
 *
 * Follows HeroUI v3 pattern: Always render ClearButton and let HeroUI manage visibility.
 * Do NOT conditionally render ClearButton based on value - breaks internal state management.
 */
export function SearchPlanInput({
  value,
  onChange,
  placeholder = 'Search...',
  'aria-label': ariaLabel,
  className,
}: SearchPlanInputProps) {
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
        <SearchField.Input placeholder={placeholder} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}
