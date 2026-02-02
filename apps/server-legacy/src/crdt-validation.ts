/**
 * CRDT Validation - Observer-based validation for Y.Doc data integrity.
 *
 * SECURITY: Validates data syncing from untrusted peers to prevent corruption.
 * A malicious peer (browser DevTools, extension, buggy MCP client) could corrupt
 * the entire network by syncing invalid data.
 *
 * Strategy: Add observers that validate data AFTER sync but BEFORE it's used.
 * Invalid data is logged as corruption but not reverted (would cause split-brain).
 *
 * @see docs/yjs-data-model.md for Y.Doc structure
 */

import {
	type AnyInputRequest,
	AnyInputRequestSchema,
	type Artifact,
	ArtifactSchema,
	type Deliverable,
	DeliverableSchema,
	getPlanMetadataWithValidation,
	type LinkedPR,
	LinkedPRSchema,
	type PlanEvent,
	PlanEventSchema,
	type PlanMetadata,
	type PlanSnapshot,
	PlanSnapshotSchema,
	type PRReviewComment,
	PRReviewCommentSchema,
	YDOC_KEYS,
} from "@shipyard/schema";
import type * as Y from "yjs";
import { logger } from "./logger.js";

/**
 * Validation result for a single Y.Doc key.
 */
export interface ValidationResult {
	key: string;
	valid: boolean;
	totalItems?: number;
	invalidItems?: number;
	errors?: string[];
}

/**
 * Full validation report for a Y.Doc.
 */
export interface ValidationReport {
	planId: string;
	timestamp: number;
	isCorrupted: boolean;
	results: ValidationResult[];
}

/**
 * Tracks corruption state per plan.
 * Used to avoid spamming logs with repeated corruption warnings.
 */
const corruptionState = new Map<
	string,
	{
		lastReported: number;
		corruptedKeys: Set<string>;
	}
>();

/** Minimum interval between reporting the same corruption (5 minutes) */
const CORRUPTION_REPORT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Check if we should report corruption for a given plan and key.
 * Returns true if this is a new corruption or enough time has passed.
 */
function shouldReportCorruption(planId: string, key: string): boolean {
	const state = corruptionState.get(planId);
	const now = Date.now();

	if (!state) {
		corruptionState.set(planId, {
			lastReported: now,
			corruptedKeys: new Set([key]),
		});
		return true;
	}

	/** New key that wasn't previously corrupted */
	if (!state.corruptedKeys.has(key)) {
		state.corruptedKeys.add(key);
		state.lastReported = now;
		return true;
	}

	/** Same key, check if enough time has passed */
	if (now - state.lastReported > CORRUPTION_REPORT_INTERVAL_MS) {
		state.lastReported = now;
		return true;
	}

	return false;
}

/**
 * Clear corruption state when a key is now valid (self-healed).
 */
function clearCorruptionState(planId: string, key: string): void {
	const state = corruptionState.get(planId);
	if (state) {
		state.corruptedKeys.delete(key);
		if (state.corruptedKeys.size === 0) {
			corruptionState.delete(planId);
		}
	}
}

/**
 * Validate metadata map against PlanMetadataSchema.
 */
function validateMetadata(doc: Y.Doc, planId: string): ValidationResult {
	const result = getPlanMetadataWithValidation(doc);

	if (result.success) {
		clearCorruptionState(planId, YDOC_KEYS.METADATA);
		return { key: YDOC_KEYS.METADATA, valid: true };
	}

	return {
		key: YDOC_KEYS.METADATA,
		valid: false,
		errors: [result.error],
	};
}

/**
 * Validate a Y.Array against a Zod schema.
 * Returns count of valid vs invalid items.
 */
function validateArray<T>(
	doc: Y.Doc,
	key: string,
	schema: {
		safeParse: (data: unknown) => {
			success: boolean;
			error?: { message: string };
		};
	},
): ValidationResult {
	const array = doc.getArray<T>(key);
	const items = array.toJSON();

	if (items.length === 0) {
		return { key, valid: true, totalItems: 0, invalidItems: 0 };
	}

	const errors: string[] = [];
	let invalidCount = 0;

	for (let i = 0; i < items.length; i++) {
		const result = schema.safeParse(items[i]);
		if (!result.success) {
			invalidCount++;
			errors.push(`Item ${i}: ${result.error?.message ?? "Unknown error"}`);
		}
	}

	return {
		key,
		valid: invalidCount === 0,
		totalItems: items.length,
		invalidItems: invalidCount,
		errors: errors.length > 0 ? errors : undefined,
	};
}

/**
 * Validate entire Y.Doc and return a report.
 * This is useful for one-time audits or debugging.
 */
export function validateYDoc(doc: Y.Doc, planId: string): ValidationReport {
	const results: ValidationResult[] = [];

	/** Validate metadata */
	results.push(validateMetadata(doc, planId));

	/** Validate arrays with their respective schemas */
	results.push(validateArray(doc, YDOC_KEYS.ARTIFACTS, ArtifactSchema));
	results.push(validateArray(doc, YDOC_KEYS.DELIVERABLES, DeliverableSchema));
	results.push(validateArray(doc, YDOC_KEYS.LINKED_PRS, LinkedPRSchema));
	results.push(validateArray(doc, YDOC_KEYS.EVENTS, PlanEventSchema));
	results.push(validateArray(doc, YDOC_KEYS.SNAPSHOTS, PlanSnapshotSchema));
	results.push(
		validateArray(doc, YDOC_KEYS.PR_REVIEW_COMMENTS, PRReviewCommentSchema),
	);
	results.push(
		validateArray(doc, YDOC_KEYS.INPUT_REQUESTS, AnyInputRequestSchema),
	);

	const isCorrupted = results.some((r) => !r.valid);

	return {
		planId,
		timestamp: Date.now(),
		isCorrupted,
		results,
	};
}

/**
 * Log corruption with appropriate severity.
 * Uses rate limiting to avoid log spam.
 */
function logCorruption(
	planId: string,
	result: ValidationResult,
	origin?: unknown,
): void {
	if (!shouldReportCorruption(planId, result.key)) {
		return;
	}

	logger.error(
		{
			planId,
			key: result.key,
			totalItems: result.totalItems,
			invalidItems: result.invalidItems,
			errors: result.errors?.slice(0, 5),
			origin: typeof origin === "string" ? origin : undefined,
		},
		"CRDT corruption detected from peer sync",
	);
}

/**
 * Create a validation observer for a Y.Array.
 * Called on every change to the array.
 */
function createArrayObserver<T>(
	planId: string,
	key: string,
	schema: {
		safeParse: (data: unknown) => {
			success: boolean;
			error?: { message: string };
		};
	},
): (event: Y.YArrayEvent<T>, transaction: Y.Transaction) => void {
	return (event, transaction) => {
		const doc = event.target.doc;
		if (!doc) return;

		const result = validateArray<T>(doc, key, schema);

		if (!result.valid) {
			logCorruption(planId, result, transaction.origin);
		} else {
			clearCorruptionState(planId, key);
		}
	};
}

/**
 * Attach CRDT validation observers to a Y.Doc.
 * Should be called after the doc is loaded/created.
 *
 * These observers run on EVERY update (local or remote) and validate
 * the data against Zod schemas. Corruption is logged but not reverted.
 *
 * @param planId - Plan identifier for logging
 * @param doc - Y.Doc to attach validators to
 */
export function attachCRDTValidation(planId: string, doc: Y.Doc): void {
	/** Validate metadata on every change */
	doc
		.getMap<PlanMetadata>(YDOC_KEYS.METADATA)
		.observe((_event, transaction) => {
			const result = validateMetadata(doc, planId);

			if (!result.valid) {
				logCorruption(planId, result, transaction.origin);
			} else {
				clearCorruptionState(planId, YDOC_KEYS.METADATA);
			}
		});

	/** Validate artifacts array */
	doc
		.getArray<Artifact>(YDOC_KEYS.ARTIFACTS)
		.observe(
			createArrayObserver<Artifact>(
				planId,
				YDOC_KEYS.ARTIFACTS,
				ArtifactSchema,
			),
		);

	/** Validate deliverables array */
	doc
		.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES)
		.observe(
			createArrayObserver<Deliverable>(
				planId,
				YDOC_KEYS.DELIVERABLES,
				DeliverableSchema,
			),
		);

	/** Validate linked PRs array */
	doc
		.getArray<LinkedPR>(YDOC_KEYS.LINKED_PRS)
		.observe(
			createArrayObserver<LinkedPR>(
				planId,
				YDOC_KEYS.LINKED_PRS,
				LinkedPRSchema,
			),
		);

	/** Validate events array */
	doc
		.getArray<PlanEvent>(YDOC_KEYS.EVENTS)
		.observe(
			createArrayObserver<PlanEvent>(planId, YDOC_KEYS.EVENTS, PlanEventSchema),
		);

	/** Validate snapshots array */
	doc
		.getArray<PlanSnapshot>(YDOC_KEYS.SNAPSHOTS)
		.observe(
			createArrayObserver<PlanSnapshot>(
				planId,
				YDOC_KEYS.SNAPSHOTS,
				PlanSnapshotSchema,
			),
		);

	/** Validate PR review comments array */
	doc
		.getArray<PRReviewComment>(YDOC_KEYS.PR_REVIEW_COMMENTS)
		.observe(
			createArrayObserver<PRReviewComment>(
				planId,
				YDOC_KEYS.PR_REVIEW_COMMENTS,
				PRReviewCommentSchema,
			),
		);

	/** Validate input requests array */
	doc
		.getArray<AnyInputRequest>(YDOC_KEYS.INPUT_REQUESTS)
		.observe(
			createArrayObserver<AnyInputRequest>(
				planId,
				YDOC_KEYS.INPUT_REQUESTS,
				AnyInputRequestSchema,
			),
		);

	logger.debug({ planId }, "CRDT validation observers attached");
}

/**
 * Detach CRDT validation state for a plan (cleanup).
 * Note: Y.Doc observers are cleaned up when the doc is destroyed.
 */
export function detachCRDTValidation(planId: string): void {
	corruptionState.delete(planId);
	logger.debug({ planId }, "CRDT validation state cleared");
}

/**
 * Check if a plan is currently flagged as corrupted.
 */
export function isPlanCorrupted(planId: string): boolean {
	const state = corruptionState.get(planId);
	return state !== undefined && state.corruptedKeys.size > 0;
}

/**
 * Get the corrupted keys for a plan.
 */
export function getCorruptedKeys(planId: string): string[] {
	const state = corruptionState.get(planId);
	return state ? Array.from(state.corruptedKeys) : [];
}
