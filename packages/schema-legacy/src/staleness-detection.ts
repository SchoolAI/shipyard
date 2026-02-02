/**
 * Shared staleness detection logic for local diff comments.
 * Used by both browser UI (useLocalDiffComments hook) and MCP server (read-diff-comments tool).
 */

import { hashLineContent } from "./line-content-hash.js";
import type { LocalDiffComment } from "./plan.js";

/**
 * Type of staleness detected for a local diff comment.
 * - 'none': Comment is not stale
 * - 'head_changed': HEAD SHA has changed since comment was created
 * - 'content_changed': Line content has changed (but HEAD is same)
 */
export type StalenessType = "none" | "head_changed" | "content_changed";

/**
 * Staleness information for a comment.
 */
export interface StalenessInfo {
	type: StalenessType;
	isStale: boolean;
}

/**
 * Extended LocalDiffComment with computed staleness information.
 * Used by UI components to display staleness warnings.
 */
export interface LocalDiffCommentWithStaleness extends LocalDiffComment {
	/** Whether this comment may be outdated */
	isStale: boolean;
	/** Type of staleness detected */
	stalenessType: StalenessType;
}

/**
 * Compute staleness for a local diff comment.
 * Checks both HEAD changes and line content changes.
 *
 * Priority:
 * 1. HEAD changed - highest priority (commit happened)
 * 2. Content changed - lower priority (edit without commit)
 * 3. None - comment is fresh
 *
 * @param comment - The local diff comment to check
 * @param currentHeadSha - Current HEAD SHA for staleness detection
 * @param currentLineContent - Current content of the line (for content hash comparison)
 * @returns StalenessInfo with type and isStale flag
 */
export function computeCommentStaleness(
	comment: LocalDiffComment,
	currentHeadSha?: string,
	currentLineContent?: string,
): StalenessInfo {
	if (currentHeadSha && comment.baseRef !== currentHeadSha) {
		return { type: "head_changed", isStale: true };
	}

	if (currentLineContent !== undefined && comment.lineContentHash) {
		const currentHash = hashLineContent(currentLineContent);
		if (currentHash !== comment.lineContentHash) {
			return { type: "content_changed", isStale: true };
		}
	}

	return { type: "none", isStale: false };
}

/**
 * Check if a comment's line content hash differs from the current line content.
 * Used for fine-grained staleness detection when HEAD hasn't changed.
 *
 * @param comment - The comment to check
 * @param currentLineContent - Current content of the line
 * @returns true if content has changed since comment was created
 */
export function isLineContentStale(
	comment: LocalDiffComment,
	currentLineContent?: string,
): boolean {
	if (!comment.lineContentHash || currentLineContent === undefined) {
		return false;
	}
	const currentHash = hashLineContent(currentLineContent);
	return comment.lineContentHash !== currentHash;
}

/**
 * Add staleness information to a local diff comment.
 * Returns a new object with isStale and stalenessType fields.
 *
 * @param comment - The comment to augment
 * @param currentHeadSha - Current HEAD SHA for staleness detection
 * @param currentLineContent - Current content of the line (optional)
 * @returns Comment with staleness information
 */
export function withStalenessInfo(
	comment: LocalDiffComment,
	currentHeadSha?: string,
	currentLineContent?: string,
): LocalDiffCommentWithStaleness {
	const staleness = computeCommentStaleness(
		comment,
		currentHeadSha,
		currentLineContent,
	);
	return {
		...comment,
		isStale: staleness.isStale,
		stalenessType: staleness.type,
	};
}

/**
 * Add staleness information to multiple comments.
 * Uses a line content map for efficient lookup.
 *
 * @param comments - Array of local diff comments
 * @param currentHeadSha - Current HEAD SHA for staleness detection
 * @param lineContentMap - Map of "path:line" to current line content
 * @returns Array of comments with staleness information
 */
export function withStalenessInfoBatch(
	comments: LocalDiffComment[],
	currentHeadSha?: string,
	lineContentMap?: Map<string, string>,
): LocalDiffCommentWithStaleness[] {
	return comments.map((comment) => {
		const key = `${comment.path}:${comment.line}`;
		const currentLineContent = lineContentMap?.get(key);
		return withStalenessInfo(comment, currentHeadSha, currentLineContent);
	});
}

/**
 * Check if a diff line is a header that should be skipped.
 */
function isDiffHeader(line: string): boolean {
	return (
		line.startsWith("diff --git") ||
		line.startsWith("index ") ||
		line.startsWith("---") ||
		line.startsWith("+++")
	);
}

/**
 * Process a single line from a diff patch and update the line content map.
 * Returns the updated line number.
 */
function processLineDiff(
	line: string,
	currentLineNumber: number,
	filePath: string,
	lineContentMap: Map<string, string>,
): number {
	const hunkMatch = line.match(/^@@.*\+(\d+)/);
	if (hunkMatch?.[1]) {
		return Number.parseInt(hunkMatch[1], 10);
	}

	if (isDiffHeader(line)) {
		return currentLineNumber;
	}

	if (line.startsWith("-")) {
		return currentLineNumber;
	}

	if (line.startsWith("+")) {
		const content = line.slice(1);
		lineContentMap.set(`${filePath}:${currentLineNumber}`, content);
		return currentLineNumber + 1;
	}

	if (line.startsWith(" ") || line === "") {
		const content = line.startsWith(" ") ? line.slice(1) : "";
		lineContentMap.set(`${filePath}:${currentLineNumber}`, content);
		return currentLineNumber + 1;
	}

	/** Lines starting with '\' (e.g., "\ No newline at end of file") are metadata */
	return currentLineNumber;
}

/**
 * Process a file's patch and add entries to the line content map.
 */
function processFilePatch(
	file: { path: string; patch?: string },
	lineContentMap: Map<string, string>,
): void {
	if (!file.patch) return;

	const lines = file.patch.split("\n");
	let currentLine = 0;

	for (const line of lines) {
		currentLine = processLineDiff(line, currentLine, file.path, lineContentMap);
	}
}

/**
 * Build a line content map from parsed diff patches.
 * Maps "path:line" to the current line content for staleness detection.
 *
 * The line numbers in diffs refer to the NEW file lines (after changes).
 * For added lines (+), we extract the content.
 * For context lines (no prefix), we also extract for potential comment matches.
 *
 * @param files - Array of file changes with patches
 * @returns Map of "path:line" to line content
 */
export function buildLineContentMap(
	files: Array<{ path: string; patch?: string }>,
): Map<string, string> {
	const lineContentMap = new Map<string, string>();

	for (const file of files) {
		processFilePatch(file, lineContentMap);
	}

	return lineContentMap;
}

/**
 * Format staleness marker for LLM output.
 * Returns a string like "[STALE: HEAD changed]" or empty string if not stale.
 *
 * @param staleness - Staleness info from computeCommentStaleness
 * @returns Formatted marker string or empty string
 */
export function formatStalenessMarker(staleness: StalenessInfo): string {
	if (!staleness.isStale) {
		return "";
	}

	switch (staleness.type) {
		case "head_changed":
			return "[STALE: HEAD changed]";
		case "content_changed":
			return "[STALE: Line content changed]";
		default:
			return "";
	}
}
