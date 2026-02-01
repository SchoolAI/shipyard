import {
	computeCommentStaleness,
	getLocalDiffComments,
	isLineContentStale,
	type LocalDiffComment,
	type LocalDiffCommentWithStaleness,
	type StalenessType,
	YDOC_KEYS,
} from "@shipyard/schema";
import { useEffect, useState } from "react";
import type * as Y from "yjs";

export type { LocalDiffCommentWithStaleness, StalenessType };

/**
 * Backwards compatibility alias.
 * @deprecated Use LocalDiffCommentWithStaleness from @shipyard/schema instead.
 */
export type LocalDiffCommentWithStale = LocalDiffCommentWithStaleness;

/**
 * Hook to observe local diff comments from Y.Doc.
 * Returns the current list of comments with computed staleness flags.
 *
 * A comment is considered stale when:
 * 1. The current HEAD SHA differs from the baseRef SHA (commits happened)
 * 2. The line content hash differs (content changed without commit)
 *
 * Note: HEAD staleness is computed here. Content staleness requires line content
 * which is computed per-file in the component layer using computeFullStaleness.
 *
 * @param ydoc - The Y.Doc to observe
 * @param currentHeadSha - Current HEAD SHA for staleness detection
 * @returns Array of local diff comments with staleness flags
 */
export function useLocalDiffComments(
	ydoc: Y.Doc,
	currentHeadSha?: string,
): LocalDiffCommentWithStaleness[] {
	const [comments, setComments] = useState<LocalDiffCommentWithStaleness[]>([]);

	useEffect(() => {
		const array = ydoc.getArray<LocalDiffComment>(
			YDOC_KEYS.LOCAL_DIFF_COMMENTS,
		);

		const update = () => {
			const rawComments = getLocalDiffComments(ydoc);
			const withStale = rawComments.map((comment) => {
				const staleness = computeCommentStaleness(comment, currentHeadSha);
				return {
					...comment,
					isStale: staleness.isStale,
					stalenessType: staleness.type,
				};
			});
			setComments(withStale);
		};

		update();
		array.observe(update);
		return () => array.unobserve(update);
	}, [ydoc, currentHeadSha]);

	return comments;
}

/**
 * Check if a comment's line content hash differs from the current line content.
 * Uses the shared isLineContentStale utility from @shipyard/schema.
 *
 * @param comment - The comment to check
 * @param currentLineContent - Current content of the line
 * @returns true if content has changed since comment was created
 */
export { isLineContentStale };

/**
 * Gets local diff comments for a specific file path.
 */
export function getLocalCommentsForFile(
	comments: LocalDiffCommentWithStaleness[],
	path: string,
): LocalDiffCommentWithStaleness[] {
	return comments.filter((c) => c.path === path);
}

/**
 * Compute full staleness for comments including line content hash checking.
 * This should be called in the component layer where line content is available.
 *
 * @param comments - Comments with basic staleness info from useLocalDiffComments
 * @param lineContentMap - Map of line number to current line content
 * @returns Comments with full staleness detection (including content hash)
 */
export function computeFullStaleness(
	comments: LocalDiffCommentWithStaleness[],
	lineContentMap: Map<number, string>,
): LocalDiffCommentWithStaleness[] {
	return comments.map((comment) => {
		if (comment.stalenessType === "head_changed") {
			return comment;
		}

		const currentLineContent = lineContentMap.get(comment.line);
		if (isLineContentStale(comment, currentLineContent)) {
			const stalenessType: StalenessType = "content_changed";
			return {
				...comment,
				isStale: true,
				stalenessType,
			};
		}

		return comment;
	});
}
