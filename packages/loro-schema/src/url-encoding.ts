/**
 * URL encoding utilities for Loro documents.
 * Format-agnostic compression and encoding for sharing via URLs.
 */

import lzstring from "lz-string";
import { z } from "zod";
import type { TaskStatus } from "./types.js";
import { TaskArtifactSchema, TaskStatusSchema } from "./validators.js";

/**
 * Lightweight snapshot reference for URL encoding.
 * Contains metadata only - full content is in keyVersions or the live Loro doc.
 */
export interface UrlSnapshotRef {
	id: string;
	status: TaskStatus;
	createdBy: string;
	reason: string;
	createdAt: number;
	threads?: { total: number; unresolved: number };
}

/**
 * Key version with full content.
 * Used for significant versions (initial, approval, completion).
 */
export interface UrlKeyVersion {
	id: string;
	content: unknown[];
}

/**
 * Deliverable from URL encoding.
 * Similar to TaskDeliverable but with optional id (can be generated on import).
 */
export interface UrlDeliverable {
	id?: string;
	text: string;
	linkedArtifactId?: string | null;
	linkedAt?: number;
}

/**
 * URL-encoded task structure with version history.
 * Includes lightweight refs for all versions + full content for key versions.
 */
export interface UrlEncodedTask {
	v: 2;
	id: string;
	title: string;
	status: TaskStatus;
	repo?: string;
	content?: unknown[];
	artifacts?: z.infer<typeof TaskArtifactSchema>[];
	deliverables?: UrlDeliverable[];
	comments?: unknown[];
	versionRefs?: UrlSnapshotRef[];
	keyVersions?: UrlKeyVersion[];
}

/**
 * Zod schema for UrlSnapshotRef.
 */
const UrlSnapshotRefSchema = z.object({
	id: z.string(),
	status: TaskStatusSchema,
	createdBy: z.string(),
	reason: z.string(),
	createdAt: z.number(),
	threads: z
		.object({
			total: z.number(),
			unresolved: z.number(),
		})
		.optional(),
});

/**
 * Zod schema for UrlKeyVersion.
 */
const UrlKeyVersionSchema = z.object({
	id: z.string(),
	content: z.array(z.unknown()),
});

/**
 * Deliverable schema for URL encoding - more permissive than CRDT schema.
 */
const UrlDeliverableSchema = z.object({
	id: z.string().optional(),
	text: z.string(),
	linkedArtifactId: z.string().nullable().optional(),
	linkedAt: z.number().optional(),
});

/**
 * Zod schema for URL-encoded task.
 */
const UrlEncodedTaskSchema = z.object({
	v: z.literal(2),
	id: z.string(),
	title: z.string(),
	status: TaskStatusSchema,
	repo: z.string().optional(),
	content: z.array(z.unknown()).optional(),
	artifacts: z.array(TaskArtifactSchema).optional(),
	deliverables: z.array(UrlDeliverableSchema).optional(),
	comments: z.array(z.unknown()).optional(),
	versionRefs: z.array(UrlSnapshotRefSchema).optional(),
	keyVersions: z.array(UrlKeyVersionSchema).optional(),
});

/**
 * Encodes a task to a URL-safe compressed string.
 * Uses lz-string compression + URI encoding for maximum compatibility.
 */
export function encodeTask(task: UrlEncodedTask): string {
	const json = JSON.stringify(task);
	return lzstring.compressToEncodedURIComponent(json);
}

/**
 * Decodes a URL-encoded task string.
 * Returns null if decoding fails, data is corrupted, or validation fails.
 */
export function decodeTask(encoded: string): UrlEncodedTask | null {
	try {
		const json = lzstring.decompressFromEncodedURIComponent(encoded);
		if (!json) return null;

		const parsed: unknown = JSON.parse(json);

		const result = UrlEncodedTaskSchema.safeParse(parsed);
		if (!result.success) {
			return null;
		}

		return result.data;
	} catch {
		return null;
	}
}

/**
 * Creates a complete task URL from a task object.
 */
export function createTaskUrl(baseUrl: string, task: UrlEncodedTask): string {
	const encoded = encodeTask(task);
	const url = new URL(baseUrl);
	url.searchParams.set("d", encoded);
	return url.toString();
}

/**
 * Snapshot type for URL history encoding.
 */
export interface TaskSnapshot {
	id: string;
	status: TaskStatus;
	createdBy: string;
	reason: string;
	createdAt: number;
	content: unknown[];
	threadSummary?: { total: number; unresolved: number };
}

/**
 * Select key versions for URL encoding.
 * Returns IDs of significant versions: first, first approval, and latest.
 * Maximum 3 versions to limit URL size.
 */
function selectKeyVersionIds(snapshots: TaskSnapshot[]): string[] {
	if (snapshots.length === 0) return [];
	if (snapshots.length <= 3) return snapshots.map((s) => s.id);

	const ids: string[] = [];

	const first = snapshots[0];
	if (first) ids.push(first.id);

	const firstApproval = snapshots.find((s) => s.status === "in_progress");
	if (firstApproval && !ids.includes(firstApproval.id)) {
		ids.push(firstApproval.id);
	}

	const last = snapshots[snapshots.length - 1];
	if (last && !ids.includes(last.id)) {
		ids.push(last.id);
	}

	return ids;
}

/**
 * Creates a task URL with version history included.
 */
export function createTaskUrlWithHistory(
	baseUrl: string,
	task: Omit<UrlEncodedTask, "v" | "versionRefs" | "keyVersions">,
	snapshots: TaskSnapshot[],
): string {
	const versionRefs: UrlSnapshotRef[] = snapshots.map((s) => ({
		id: s.id,
		status: s.status,
		createdBy: s.createdBy,
		reason: s.reason,
		createdAt: s.createdAt,
		threads: s.threadSummary,
	}));

	const keyVersionIds = selectKeyVersionIds(snapshots);
	const keyVersions: UrlKeyVersion[] = snapshots
		.filter((s) => keyVersionIds.includes(s.id))
		.map((s) => ({
			id: s.id,
			content: s.content,
		}));

	const urlTask: UrlEncodedTask = {
		v: 2,
		...task,
		versionRefs: versionRefs.length > 0 ? versionRefs : undefined,
		keyVersions: keyVersions.length > 0 ? keyVersions : undefined,
	};

	return createTaskUrl(baseUrl, urlTask);
}

/**
 * Safely extracts the location.search value from globalThis if available.
 */
function getLocationSearch(): string | null {
	if (typeof globalThis === "undefined") return null;
	if (!("location" in globalThis)) return null;

	const globalRecord = Object.fromEntries(Object.entries(globalThis));
	const location = globalRecord.location;
	if (typeof location !== "object" || location === null) return null;
	if (!("search" in location)) return null;

	const locationRecord = Object.fromEntries(Object.entries(location));
	const search = locationRecord.search;
	return typeof search === "string" ? search : null;
}

/**
 * Extracts and decodes task from current URL.
 */
export function getTaskFromUrl(): UrlEncodedTask | null {
	const search = getLocationSearch();
	if (!search) return null;

	const params = new URLSearchParams(search);
	const encoded = params.get("d");
	if (!encoded) return null;

	return decodeTask(encoded);
}
