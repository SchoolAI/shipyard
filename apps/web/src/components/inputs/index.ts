/**
 * Input request components for handling different input types.
 *
 * Architecture: Each input type has its own focused component:
 * - TextInput: Single-line text entry
 * - MultilineInput: Multi-line text area
 * - ChoiceInput: Radio buttons or checkboxes with "Other" option
 * - ConfirmInput: Yes/No buttons
 * - NumberInput: Numeric value with bounds validation
 * - EmailInput: Email address with domain restriction
 * - DateInput: Date selection with range validation
 * - DropdownInput: Searchable select for long option lists
 * - RatingInput: Scale rating with stars/numbers/emoji
 */

export { ChoiceInput } from './ChoiceInput';
export { ConfirmInput } from './ConfirmInput';
export { DateInput } from './DateInput';
export { DropdownInput } from './DropdownInput';
export { EmailInput } from './EmailInput';
export { MultilineInput } from './MultilineInput';
export { NumberInput } from './NumberInput';
export { RatingInput } from './RatingInput';
export { TextInput } from './TextInput';

// Re-export types for consumers
export type { BaseInputProps, ChoiceInputProps, ConfirmInputProps } from './types';

// Re-export utils for consumers
export { formatTime, OTHER_OPTION_LABEL, OTHER_OPTION_VALUE } from './utils';
