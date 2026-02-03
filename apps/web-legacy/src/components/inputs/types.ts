/**
 * Shared types for input request components.
 */

import type {
	ChoiceInputRequest,
	ConfirmInputRequest,
	DateInputRequest,
	EmailInputRequest,
	InputRequest,
	MultilineInputRequest,
	NumberInputRequest,
	RatingInputRequest,
	TextInputRequest,
} from "@shipyard/schema";

/**
 * Base props passed to all input type components.
 * Generic parameter allows type narrowing for specific request types.
 */
export interface BaseInputProps<T extends InputRequest = InputRequest> {
	/** The input request configuration */
	request: T;
	/** Current value(s) selected/entered by user */
	value: string | string[];
	/** Callback to update the value */
	setValue: (val: string | string[]) => void;
	/** Whether the form is currently submitting */
	isSubmitting: boolean;
}

/**
 * Extended props for choice inputs that need custom "Other" option handling.
 */
export interface ChoiceInputProps extends BaseInputProps<ChoiceInputRequest> {
	/** Current value for the custom "Other" text input */
	customInput: string;
	/** Callback to update the custom input value */
	setCustomInput: (val: string) => void;
	/** Whether the "Other" option is currently selected */
	isOtherSelected: boolean;
}

/**
 * Props for confirm inputs that use button responses instead of form submission.
 */
export interface ConfirmInputProps extends BaseInputProps<ConfirmInputRequest> {
	/** Remaining time in seconds (-1 = not initialized) */
	remainingTime: number;
	/** Callback to handle response (yes, no, or custom explanation) */
	onConfirmResponse: (response: string) => void;
}

/**
 * Extended props for rating inputs that need N/A and "Other" escape hatch handling.
 */
export interface RatingInputProps extends BaseInputProps<RatingInputRequest> {
	/** Current value for the custom "Other" text input */
	customInput: string;
	/** Callback to update the custom input value */
	setCustomInput: (val: string) => void;
	/** Whether the "Other" option is currently selected */
	isOtherSelected: boolean;
	/** Whether the "N/A" option is currently selected */
	isNaSelected: boolean;
}

export type {
	ChoiceInputRequest,
	ConfirmInputRequest,
	DateInputRequest,
	EmailInputRequest,
	MultilineInputRequest,
	NumberInputRequest,
	RatingInputRequest,
	TextInputRequest,
};
