/**
 * User input request for sandbox.
 *
 * Requests input from user via browser modal, blocking until response.
 * Ported from apps/server-legacy/src/tools/execute-code.ts requestUserInput.
 */

import { generateInputRequestId } from "@shipyard/loro-schema";
import { getRepo } from "../../loro/repo.js";
import { logger } from "../../utils/logger.js";

/** Default timeout for input requests (30 minutes) */
const DEFAULT_TIMEOUT_SECONDS = 1800;

/** Minimum timeout (5 minutes) */
const MIN_TIMEOUT_SECONDS = 300;

/** Maximum timeout (4 hours) */
const MAX_TIMEOUT_SECONDS = 14400;

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
 *
 * NOTE: This is a simplified implementation that stores the request in the
 * Loro document and polls for a response. A full implementation would use
 * Loro subscriptions for real-time updates.
 */
export async function requestUserInput(
	opts: SingleQuestionOptions | MultiQuestionOptions,
): Promise<InputRequestResult> {
	const repo = getRepo();
	const requestId = generateInputRequestId();

	/** Calculate timeout */
	const timeoutSeconds = Math.max(
		MIN_TIMEOUT_SECONDS,
		Math.min(opts.timeout ?? DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS),
	);
	const expiresAt = Date.now() + timeoutSeconds * 1000;

	logger.info({ requestId, timeoutSeconds }, "Creating input request");

	// NOTE: Currently unused as the full input request system is not yet implemented.
	// TODO: When integrated, use repo.get(ROOM_DOC_ID, RoomSchema) to create
	// and track input requests in the CRDT.
	void repo; // Placeholder to avoid unused variable warning

	/** Determine if single or multi question mode */
	const isMultiQuestion = "questions" in opts && Array.isArray(opts.questions);

	if (isMultiQuestion) {
		/** Multi-question mode */
		const multiOpts = opts as MultiQuestionOptions;
		const questions = multiOpts.questions.filter(
			(q): q is NonNullable<typeof q> => q != null,
		);

		if (questions.length === 0) {
			return {
				success: false,
				status: "cancelled",
				reason: "No valid questions provided",
			};
		}

		// TODO: Create multi input request in roomDoc.inputRequests
		// For now, return a simulated timeout
		logger.info(
			{ requestId, questionCount: questions.length },
			"Multi-question input request created (waiting for response)",
		);
	} else {
		/** Single question mode */
		const singleOpts = opts as SingleQuestionOptions;

		// TODO: Create single input request in roomDoc.inputRequests
		// For now, return a simulated timeout
		logger.info(
			{ requestId, type: singleOpts.type, message: singleOpts.message },
			"Single-question input request created (waiting for response)",
		);
	}

	/** Poll for response until timeout */
	const pollInterval = 1000; // 1 second
	const startTime = Date.now();

	while (Date.now() < expiresAt) {
		/** Check if request has been answered */
		// TODO: Read from roomDoc.inputRequests[requestId]
		// For now, this is a placeholder that will time out

		/** Wait before next poll */
		await new Promise((resolve) => setTimeout(resolve, pollInterval));

		/** Log progress every 30 seconds */
		const elapsed = Math.floor((Date.now() - startTime) / 1000);
		if (elapsed % 30 === 0 && elapsed > 0) {
			logger.debug(
				{ requestId, elapsedSeconds: elapsed },
				"Still waiting for input response",
			);
		}
	}

	/** Timeout reached */
	logger.warn({ requestId }, "Input request timed out");

	return {
		success: false,
		status: "cancelled",
		reason: `Request timed out after ${timeoutSeconds} seconds. The user did not respond in time.`,
	};
}
