/**
 * Input request components for handling different input types.
 *
 * Architecture: Each input type has its own focused component:
 * - TextInput: Single-line text entry
 * - MultilineInput: Multi-line text area
 * - ChoiceInput: Radio/checkbox or searchable dropdown (auto-switches based on option count)
 * - ConfirmInput: Yes/No buttons
 * - NumberInput: Numeric value with bounds validation
 * - EmailInput: Email address with domain restriction
 * - DateInput: Date selection with range validation
 * - RatingInput: Scale rating with stars/numbers/emoji
 *
 * Note: DropdownInput was merged into ChoiceInput - UI auto-switches for 9+ options.
 */

export { ChoiceInput } from "./ChoiceInput";
export { ConfirmInput } from "./ConfirmInput";
export { DateInput } from "./DateInput";
export { EmailInput } from "./EmailInput";
export { MultilineInput } from "./MultilineInput";
export { NumberInput } from "./NumberInput";
export { RatingInput } from "./RatingInput";
export { TextInput } from "./TextInput";

export type {
	BaseInputProps,
	ChoiceInputProps,
	ConfirmInputProps,
	RatingInputProps,
} from "./types";

export {
	formatTime,
	NA_OPTION_LABEL,
	NA_OPTION_VALUE,
	OTHER_OPTION_LABEL,
	OTHER_OPTION_VALUE,
} from "./utils";
