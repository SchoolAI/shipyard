/**
 * Shared thread formatting utilities for LLM-friendly output.
 * Used by both MCP server (read_plan) and hook (ExitPlanMode denial).
 */

import type { Thread } from "./thread.js";
import { extractTextFromCommentBody } from "./thread.js";

export interface FormatThreadsOptions {
	/** Include resolved threads (default: false) */
	includeResolved?: boolean;
	/** Max length for selected text preview (default: 100) */
	selectedTextMaxLength?: number;
	/** Function to resolve user IDs to display names */
	resolveUser?: (userId: string) => string;
}

/**
 * Format comment threads for LLM consumption.
 * Returns clean, readable feedback text.
 */
export function formatThreadsForLLM(
	threads: Thread[],
	options: FormatThreadsOptions = {},
): string {
	const {
		includeResolved = false,
		selectedTextMaxLength = 100,
		resolveUser,
	} = options;

	const unresolvedThreads = threads.filter((t) => !t.resolved);
	const resolvedCount = threads.length - unresolvedThreads.length;
	const threadsToShow = includeResolved ? threads : unresolvedThreads;

	if (threadsToShow.length === 0) {
		if (resolvedCount > 0) {
			return `All ${resolvedCount} comment(s) have been resolved.`;
		}
		return "";
	}

	const feedbackLines = threadsToShow.map((thread, index) => {
		const location = thread.selectedText
			? `On: "${truncate(thread.selectedText, selectedTextMaxLength)}"`
			: `Comment ${index + 1}`;

		const comments = thread.comments
			.map((c, idx) => {
				const text = extractTextFromCommentBody(c.body);
				const author = resolveUser
					? resolveUser(c.userId)
					: c.userId.slice(0, 8);

				if (idx === 0) {
					return `[thread:${thread.id}] ${author}: ${text}`;
				}
				return `[comment:${c.id}] ${author} (reply): ${text}`;
			})
			.join("\n");

		const resolvedMarker = thread.resolved ? " [Resolved]" : "";
		return `${location}${resolvedMarker}\n${comments}`;
	});

	let output = feedbackLines.join("\n\n");

	if (!includeResolved && resolvedCount > 0) {
		output += `\n\n---\n(${resolvedCount} resolved comment(s) not shown)`;
	}

	return output;
}

function truncate(text: string, maxLength: number): string {
	const cleaned = text.replace(/\n/g, " ").trim();
	if (cleaned.length <= maxLength) {
		return cleaned;
	}
	return `${cleaned.slice(0, maxLength)}...`;
}
