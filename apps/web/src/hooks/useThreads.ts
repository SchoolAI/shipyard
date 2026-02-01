/**
 * Hook to manage comment threads from the Y.Doc.
 * Provides access to threads and operations for creating/replying to comments.
 *
 * This hook reads from YDOC_KEYS.THREADS and provides a reactive interface
 * for the comment gutter UI.
 */

import {
	isPlainObject,
	parseThreads,
	type Thread,
	type ThreadComment,
	ThreadCommentSchema,
	toPlainObject,
	YDOC_KEYS,
} from "@shipyard/schema";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";
import type * as Y from "yjs";

/** Extended thread with anchor block information */
export interface AnchoredThread extends Thread {
	/** Block ID this thread is anchored to (derived from thread marks) */
	anchorBlockId: string | null;
}

interface UseThreadsOptions {
	/** Include resolved threads (default: false) */
	includeResolved?: boolean;
}

interface UseThreadsResult {
	/** All threads (filtered by options) */
	threads: Thread[];
	/** Map of block ID to threads anchored to that block */
	threadsByBlock: Map<string, Thread[]>;
	/** Get a specific thread by ID */
	getThread: (threadId: string) => Thread | undefined;
	/** Add a reply to a thread */
	addReply: (threadId: string, body: string, userId: string) => boolean;
	/** Create a new thread on a block */
	createThread: (
		blockId: string,
		body: string,
		userId: string,
		selectedText?: string,
	) => string | null;
	/** Toggle thread resolved status */
	toggleResolved: (threadId: string) => boolean;
	/** Delete a thread entirely */
	deleteThread: (threadId: string) => boolean;
	/** Loading state */
	isLoading: boolean;
}

/**
 * Type guard to check if a thread has an anchorBlockId field.
 * Used to safely access the anchorBlockId property on threads.
 */
function hasAnchorBlockId(
	thread: Thread,
): thread is Thread & { anchorBlockId: string } {
	return "anchorBlockId" in thread && typeof thread.anchorBlockId === "string";
}

/**
 * Type guard to check if a Y.XmlElement-like object has getAttribute method.
 */
function isXmlElementLike(
	value: unknown,
): value is { getAttribute: (name: string) => string | null } {
	return (
		typeof value === "object" &&
		value !== null &&
		"getAttribute" in value &&
		typeof value.getAttribute === "function"
	);
}

/**
 * Try to extract the anchor block ID from a thread.
 * BlockNote stores thread anchors in the document marks, but we can use
 * heuristics based on the thread ID and document structure.
 *
 * For now, we store anchorBlockId on the thread itself (extension of schema).
 */
function getThreadAnchorBlockId(thread: Thread, ydoc: Y.Doc): string | null {
	/**
	 * Check if thread has explicit anchorBlockId (our extension).
	 * This is stored when we create threads through our UI.
	 */
	if (hasAnchorBlockId(thread)) {
		return thread.anchorBlockId;
	}

	/**
	 * Fallback: Try to find the block by searching the document fragment.
	 * BlockNote stores comment marks in the prosemirror document.
	 * This is expensive, so we only do it if necessary.
	 */
	try {
		const fragment = ydoc.getXmlFragment(YDOC_KEYS.DOCUMENT_FRAGMENT);
		const blocks = fragment.toArray();

		/**
		 * Search through blocks for comment marks referencing this thread.
		 * Note: This is a simplified implementation. Full implementation would
		 * need to traverse the ProseMirror marks structure.
		 */
		for (const block of blocks) {
			if (isXmlElementLike(block)) {
				const blockId = block.getAttribute("id");
				if (blockId) {
					/**
					 * Check if this block has marks referencing the thread.
					 * This would require deeper ProseMirror integration.
					 */
				}
			}
		}
	} catch {
		/** Fragment may not exist yet */
	}

	return null;
}

/**
 * Hook to access and manage comment threads.
 */
export function useThreads(
	ydoc: Y.Doc,
	options: UseThreadsOptions = {},
): UseThreadsResult {
	const { includeResolved = false } = options;

	const [threads, setThreads] = useState<Thread[]>([]);
	const [threadsByBlock, setThreadsByBlock] = useState<Map<string, Thread[]>>(
		new Map(),
	);
	const [isLoading, setIsLoading] = useState(true);

	/**
	 * Update threads from Y.Doc.
	 */
	const updateThreads = useCallback(() => {
		const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
		const threadsJson = threadsMap.toJSON();
		const threadsData = isPlainObject(threadsJson) ? threadsJson : {};
		const allThreads = parseThreads(threadsData);

		/** Filter by resolved status */
		const filteredThreads = includeResolved
			? allThreads
			: allThreads.filter((t) => !t.resolved);

		setThreads(filteredThreads);

		/** Group by anchor block */
		const byBlock = new Map<string, Thread[]>();
		for (const thread of filteredThreads) {
			const anchorBlockId = getThreadAnchorBlockId(thread, ydoc);
			if (anchorBlockId) {
				const existing = byBlock.get(anchorBlockId) ?? [];
				existing.push(thread);
				byBlock.set(anchorBlockId, existing);
			}
		}
		setThreadsByBlock(byBlock);
		setIsLoading(false);
	}, [ydoc, includeResolved]);

	/**
	 * Subscribe to thread changes.
	 */
	useEffect(() => {
		const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);

		/** Initial load */
		updateThreads();

		/** Observe changes */
		threadsMap.observe(updateThreads);

		return () => {
			threadsMap.unobserve(updateThreads);
		};
	}, [ydoc, updateThreads]);

	/**
	 * Get a specific thread by ID.
	 */
	const getThread = useCallback(
		(threadId: string): Thread | undefined => {
			return threads.find((t) => t.id === threadId);
		},
		[threads],
	);

	/**
	 * Add a reply to an existing thread.
	 */
	const addReply = useCallback(
		(threadId: string, body: string, userId: string): boolean => {
			const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
			const threadDataRaw = threadsMap.get(threadId);

			if (!threadDataRaw) {
				return false;
			}

			/**
			 * Handle both Y.Map and plain object.
			 * toPlainObject safely converts Y.Map (which has toJSON) to plain object.
			 */
			const threadData = toPlainObject(threadDataRaw);

			if (!threadData || !("comments" in threadData)) {
				return false;
			}

			const comment = ThreadCommentSchema.parse({
				id: nanoid(),
				userId,
				body,
				createdAt: Date.now(),
			});

			const existingComments = Array.isArray(threadData.comments)
				? threadData.comments
				: [];
			const updatedThread = {
				...threadData,
				comments: [...existingComments, comment],
			};

			threadsMap.set(threadId, updatedThread);
			return true;
		},
		[ydoc],
	);

	/**
	 * Create a new thread on a block.
	 */
	const createThread = useCallback(
		(
			blockId: string,
			body: string,
			userId: string,
			selectedText?: string,
		): string | null => {
			const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);

			const threadId = nanoid();
			const comment: ThreadComment = {
				id: nanoid(),
				userId,
				body,
				createdAt: Date.now(),
			};

			const thread: Thread & { anchorBlockId: string } = {
				id: threadId,
				comments: [comment],
				resolved: false,
				selectedText,
				anchorBlockId: blockId,
			};

			threadsMap.set(threadId, thread);
			return threadId;
		},
		[ydoc],
	);

	/**
	 * Toggle the resolved status of a thread.
	 */
	const toggleResolved = useCallback(
		(threadId: string): boolean => {
			const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
			const threadDataRaw = threadsMap.get(threadId);

			if (!threadDataRaw) {
				return false;
			}

			/**
			 * Handle both Y.Map and plain object.
			 * toPlainObject safely converts Y.Map (which has toJSON) to plain object.
			 */
			const threadData = toPlainObject(threadDataRaw);

			if (!threadData) {
				return false;
			}

			const currentResolved = threadData.resolved === true;

			const updatedThread = {
				...threadData,
				resolved: !currentResolved,
			};

			threadsMap.set(threadId, updatedThread);
			return true;
		},
		[ydoc],
	);

	/**
	 * Delete a thread entirely from the Y.Doc.
	 */
	const deleteThread = useCallback(
		(threadId: string): boolean => {
			const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
			const threadData = threadsMap.get(threadId);

			if (!threadData) {
				return false;
			}

			threadsMap.delete(threadId);
			return true;
		},
		[ydoc],
	);

	return {
		threads,
		threadsByBlock,
		getThread,
		addReply,
		createThread,
		toggleResolved,
		deleteThread,
		isLoading,
	};
}
