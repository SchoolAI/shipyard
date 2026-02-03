/**
 * Mock Loro Repo for testing MCP tools.
 *
 * Provides an in-memory Loro setup that doesn't require real adapters.
 */

import { vi } from "vitest";
import {
	generateSessionToken,
	hashSessionToken,
} from "../tools/session-token.js";

/** Test session token that can be used across tests */
export const TEST_SESSION_TOKEN = "test-session-token-12345";
export const TEST_SESSION_TOKEN_HASH = hashSessionToken(TEST_SESSION_TOKEN);

/** Test GitHub username */
export const TEST_GITHUB_USERNAME = "test-user";

/**
 * Mock task metadata for testing.
 */
export interface MockTaskMeta {
	id: string;
	title: string;
	status: string;
	createdAt: number;
	updatedAt: number;
	completedAt: number | null;
	completedBy: string | null;
	ownerId: string | null;
	sessionTokenHash: string;
	epoch: number;
	repo: string | null;
	tags: string[];
	archivedAt: number | null;
	archivedBy: string | null;
}

/**
 * Create a mock task meta object with defaults.
 */
export function createMockTaskMeta(
	overrides?: Partial<MockTaskMeta>,
): MockTaskMeta {
	const now = Date.now();
	return {
		id: "test-task-123",
		title: "Test Task",
		status: "pending_review",
		createdAt: now,
		updatedAt: now,
		completedAt: null,
		completedBy: null,
		ownerId: TEST_GITHUB_USERNAME,
		sessionTokenHash: TEST_SESSION_TOKEN_HASH,
		epoch: 1,
		repo: "test-org/test-repo",
		tags: [],
		archivedAt: null,
		archivedBy: null,
		...overrides,
	};
}

/**
 * In-memory task document store for tests.
 */
const taskStore = new Map<
	string,
	{
		meta: MockTaskMeta;
		artifacts: unknown[];
		deliverables: unknown[];
		events: unknown[];
		comments: Record<string, unknown>;
		linkedPRs: unknown[];
		inputRequests: unknown[];
		changeSnapshots: Record<string, unknown>;
	}
>();

/**
 * Create an in-memory mock task for testing.
 */
export function createMockTask(
	taskId: string,
	meta?: Partial<MockTaskMeta>,
): void {
	taskStore.set(taskId, {
		meta: createMockTaskMeta({ id: taskId, ...meta }),
		artifacts: [],
		deliverables: [],
		events: [],
		comments: {},
		linkedPRs: [],
		inputRequests: [],
		changeSnapshots: {},
	});
}

/**
 * Get a mock task from the store.
 */
export function getMockTask(taskId: string) {
	return taskStore.get(taskId);
}

/**
 * Clear all mock tasks (call in beforeEach).
 */
export function clearMockTasks(): void {
	taskStore.clear();
}

/**
 * Create a mock TaskDocument that follows the real interface.
 */
export function createMockTaskDocument(taskId: string) {
	const task = taskStore.get(taskId);
	if (!task) {
		throw new Error(`Mock task ${taskId} not found`);
	}

	return {
		taskId,
		get meta() {
			return {
				get id() {
					return task.meta.id;
				},
				set id(v: string) {
					task.meta.id = v;
				},
				get title() {
					return task.meta.title;
				},
				set title(v: string) {
					task.meta.title = v;
				},
				get status() {
					return task.meta.status;
				},
				set status(v: string) {
					task.meta.status = v;
				},
				get createdAt() {
					return task.meta.createdAt;
				},
				set createdAt(v: number) {
					task.meta.createdAt = v;
				},
				get updatedAt() {
					return task.meta.updatedAt;
				},
				set updatedAt(v: number) {
					task.meta.updatedAt = v;
				},
				get completedAt() {
					return task.meta.completedAt;
				},
				set completedAt(v: number | null) {
					task.meta.completedAt = v;
				},
				get completedBy() {
					return task.meta.completedBy;
				},
				set completedBy(v: string | null) {
					task.meta.completedBy = v;
				},
				get ownerId() {
					return task.meta.ownerId;
				},
				set ownerId(v: string | null) {
					task.meta.ownerId = v;
				},
				get sessionTokenHash() {
					return task.meta.sessionTokenHash;
				},
				set sessionTokenHash(v: string) {
					task.meta.sessionTokenHash = v;
				},
				get epoch() {
					return task.meta.epoch;
				},
				set epoch(v: number) {
					task.meta.epoch = v;
				},
				get repo() {
					return task.meta.repo;
				},
				set repo(v: string | null) {
					task.meta.repo = v;
				},
				get tags() {
					return {
						push: (tag: string) => task.meta.tags.push(tag),
						toJSON: () => task.meta.tags,
						get length() {
							return task.meta.tags.length;
						},
						delete: (_start: number, _count: number) => {
							task.meta.tags.splice(_start, _count);
						},
					};
				},
				get archivedAt() {
					return task.meta.archivedAt;
				},
				set archivedAt(v: number | null) {
					task.meta.archivedAt = v;
				},
				get archivedBy() {
					return task.meta.archivedBy;
				},
				set archivedBy(v: string | null) {
					task.meta.archivedBy = v;
				},
			};
		},
		get artifacts() {
			return {
				push: (artifact: unknown) => task.artifacts.push(artifact),
				toJSON: () => task.artifacts,
			};
		},
		get deliverables() {
			return {
				push: (deliverable: unknown) => task.deliverables.push(deliverable),
				toJSON: () => task.deliverables,
			};
		},
		get events() {
			return {
				push: (event: unknown) => task.events.push(event),
				toJSON: () => task.events,
			};
		},
		get comments() {
			return {
				set: (key: string, value: unknown) => {
					task.comments[key] = value;
				},
				get: (key: string) => task.comments[key],
				toJSON: () => task.comments,
			};
		},
		get linkedPRs() {
			return {
				push: (pr: unknown) => task.linkedPRs.push(pr),
				toJSON: () => task.linkedPRs,
			};
		},
		get inputRequests() {
			return {
				push: (request: unknown) => task.inputRequests.push(request),
				toJSON: () => task.inputRequests,
			};
		},
		get changeSnapshots() {
			return {
				set: (key: string, value: unknown) => {
					task.changeSnapshots[key] = value;
				},
				get: (key: string) => task.changeSnapshots[key],
				toJSON: () => task.changeSnapshots,
			};
		},
		logEvent: vi.fn((type: string, actor: string, data?: unknown) => {
			const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			task.events.push({
				id: eventId,
				type,
				actor,
				timestamp: Date.now(),
				inboxWorthy: null,
				inboxFor: null,
				...(data ?? {}),
			});
			return eventId;
		}),
		updateStatus: vi.fn((status: string, actor: string) => {
			const oldStatus = task.meta.status;
			task.meta.status = status;
			task.meta.updatedAt = Date.now();
			if (status === "completed") {
				task.meta.completedAt = Date.now();
				task.meta.completedBy = actor;
			}
			task.events.push({
				id: `evt-status-${Date.now()}`,
				type: "status_changed",
				actor,
				timestamp: Date.now(),
				inboxWorthy: null,
				inboxFor: null,
				fromStatus: oldStatus,
				toStatus: status,
			});
		}),
		syncTitleToRoom: vi.fn(),
		syncPendingRequestsToRoom: vi.fn(),
		dispose: vi.fn(),
	};
}

/**
 * Generate a new session token and hash for testing.
 */
export function createTestSessionToken(): {
	token: string;
	hash: string;
} {
	const token = generateSessionToken();
	const hash = hashSessionToken(token);
	return { token, hash };
}
