/**
 * User input request for sandbox.
 *
 * Requests input from user via browser modal, blocking until response.
 * Ported from apps/server-legacy/src/tools/execute-code.ts requestUserInput.
 */

// TODO: Import from Loro doc helpers
// import { getOrCreateDoc } from '../../loro/index.js'

/**
 * Question type for multi-question mode.
 */
export interface Question {
	type:
		| "text"
		| "multiline"
		| "choice"
		| "confirm"
		| "number"
		| "email"
		| "date"
		| "rating";
	message: string;
	options?: string[];
	multiSelect?: boolean;
	displayAs?: "radio" | "checkbox" | "dropdown";
	defaultValue?: string;
	min?: number;
	max?: number;
	format?: "integer" | "decimal" | "currency" | "percentage";
	minDate?: string;
	maxDate?: string;
	domain?: string;
	style?: "stars" | "numbers" | "emoji";
	labels?: { low?: string; high?: string };
}

/**
 * Single question input options.
 */
export interface SingleQuestionOptions {
	message: string;
	type:
		| "text"
		| "multiline"
		| "choice"
		| "confirm"
		| "number"
		| "email"
		| "date"
		| "rating";
	options?: string[];
	multiSelect?: boolean;
	displayAs?: "radio" | "checkbox" | "dropdown";
	defaultValue?: string;
	timeout?: number;
	taskId?: string;
	isBlocker?: boolean;
	min?: number;
	max?: number;
	format?: "integer" | "decimal" | "currency" | "percentage";
	minDate?: string;
	maxDate?: string;
	domain?: string;
	style?: "stars" | "numbers" | "emoji";
	labels?: { low?: string; high?: string };
}

/**
 * Multi-question input options.
 */
export interface MultiQuestionOptions {
	questions: Question[];
	timeout?: number;
	taskId?: string;
	isBlocker?: boolean;
}

/**
 * Input request result.
 */
export interface InputRequestResult {
	success: boolean;
	response?: string | Record<string, string>;
	status: "answered" | "declined" | "cancelled";
	reason?: string;
}

/**
 * Request user input via browser modal.
 * Supports single-question and multi-question modes.
 */
export async function requestUserInput(
	_opts: SingleQuestionOptions | MultiQuestionOptions,
): Promise<InputRequestResult> {
	// TODO: Implement using Loro doc input requests
	// Create input request in doc, wait for response via Loro subscription
	throw new Error("Not implemented");
}
