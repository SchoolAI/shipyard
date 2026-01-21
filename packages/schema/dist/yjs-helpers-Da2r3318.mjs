import { ArtifactSchema, ConversationVersionSchema, DeliverableSchema, LinkedPRSchema, PRReviewCommentSchema, PlanEventSchema, PlanMetadataSchema, PlanSnapshotSchema } from "./plan.mjs";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as Y from "yjs";

//#region src/assert-never.ts
/**
* Exhaustive type checking helper.
* Ensures all cases of a discriminated union are handled.
*
* Usage:
* ```typescript
* switch (value.type) {
*   case 'a': return handleA();
*   case 'b': return handleB();
*   default: return assertNever(value);
* }
* ```
*
* When a new union member is added, TypeScript will fail at compile time
* if not all cases are handled in the switch statement.
*/
function assertNever(value) {
	throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}

//#endregion
//#region src/hook-api.ts
/**
* Shared schemas for hook ↔ server HTTP API communication.
* These types are used by both @shipyard/hook and @shipyard/server.
*/
/**
* Tracks an agent's presence in a plan session.
*/
const AgentPresenceSchema = z.object({
	agentType: z.string(),
	sessionId: z.string(),
	connectedAt: z.number(),
	lastSeenAt: z.number()
});
/**
* A single comment in a review thread.
*/
const ReviewCommentSchema = z.object({
	author: z.string(),
	content: z.string(),
	createdAt: z.number()
});
/**
* Review feedback for a specific block in the plan.
*/
const ReviewFeedbackSchema = z.object({
	threadId: z.string(),
	blockId: z.string().optional(),
	comments: z.array(ReviewCommentSchema)
});
/**
* POST /api/hook/session - Create a new plan session
*/
const CreateHookSessionRequestSchema = z.object({
	sessionId: z.string(),
	agentType: z.string().default("claude-code"),
	metadata: z.record(z.string(), z.unknown()).optional()
});
const CreateHookSessionResponseSchema = z.object({
	planId: z.string(),
	url: z.string()
});
/**
* PUT /api/hook/plan/:id/content - Update plan content
*/
const UpdatePlanContentRequestSchema = z.object({
	content: z.string(),
	filePath: z.string().optional()
});
const UpdatePlanContentResponseSchema = z.object({
	success: z.boolean(),
	updatedAt: z.number()
});
/**
* GET /api/hook/plan/:id/review - Get review status
* Uses discriminated union to match PlanMetadata structure
*/
const GetReviewStatusResponseSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("draft") }),
	z.object({
		status: z.literal("pending_review"),
		reviewRequestId: z.string()
	}),
	z.object({
		status: z.literal("changes_requested"),
		reviewedAt: z.number(),
		reviewedBy: z.string(),
		reviewComment: z.string().optional(),
		feedback: z.array(ReviewFeedbackSchema).optional()
	}),
	z.object({
		status: z.literal("in_progress"),
		reviewedAt: z.number(),
		reviewedBy: z.string()
	}),
	z.object({
		status: z.literal("completed"),
		completedAt: z.number(),
		completedBy: z.string(),
		snapshotUrl: z.string().optional()
	})
]);
/**
* POST /api/hook/plan/:id/presence - Update agent presence
*/
const UpdatePresenceRequestSchema = z.object({
	agentType: z.string(),
	sessionId: z.string()
});
const UpdatePresenceResponseSchema = z.object({ success: z.boolean() });
/**
* Error response from hook API
*/
const HookApiErrorSchema = z.object({ error: z.string() });
/**
* POST /register - Register a WebSocket server
*/
const RegisterServerRequestSchema = z.object({
	port: z.number().int().positive(),
	pid: z.number().int().positive()
});
const RegisterServerResponseSchema = z.object({
	success: z.boolean(),
	entry: z.object({
		port: z.number(),
		pid: z.number(),
		url: z.string(),
		registeredAt: z.number()
	})
});
/**
* DELETE /unregister - Unregister a WebSocket server
*/
const UnregisterServerRequestSchema = z.object({ pid: z.number().int().positive() });
const UnregisterServerResponseSchema = z.object({
	success: z.boolean(),
	existed: z.boolean()
});
/**
* POST /api/plan/:id/subscribe - Create a subscription
*/
const CreateSubscriptionRequestSchema = z.object({
	subscribe: z.array(z.string()).optional(),
	windowMs: z.number().positive().optional(),
	maxWindowMs: z.number().positive().optional(),
	threshold: z.number().positive().optional()
});
const CreateSubscriptionResponseSchema = z.object({ clientId: z.string() });

//#endregion
//#region src/input-request.ts
/**
* Valid input request types.
* - text: Single-line text input
* - multiline: Multi-line text input
* - choice: Select from predefined options
* - confirm: Boolean yes/no question
*/
const InputRequestTypeValues = [
	"text",
	"multiline",
	"choice",
	"confirm"
];
/**
* Valid status values for an input request.
* - pending: Awaiting user response
* - answered: User has responded
* - declined: User explicitly declined to answer
* - cancelled: Request cancelled (timeout)
*/
const InputRequestStatusValues = [
	"pending",
	"answered",
	"declined",
	"cancelled"
];
const InputRequestBaseSchema = z.object({
	id: z.string(),
	createdAt: z.number(),
	message: z.string().min(1, "Message cannot be empty"),
	status: z.enum(InputRequestStatusValues),
	defaultValue: z.string().optional(),
	timeout: z.number().int().min(10, "Timeout must be at least 10 seconds").max(600, "Timeout cannot exceed 10 minutes").optional(),
	planId: z.string().optional(),
	response: z.unknown().optional(),
	answeredAt: z.number().optional(),
	answeredBy: z.string().optional()
});
/** Text input request - single line text entry */
const TextInputSchema = InputRequestBaseSchema.extend({ type: z.literal("text") });
/** Multiline input request - multi-line text entry */
const MultilineInputSchema = InputRequestBaseSchema.extend({ type: z.literal("multiline") });
/** Choice input request - select from predefined options */
const ChoiceInputSchema = InputRequestBaseSchema.extend({
	type: z.literal("choice"),
	options: z.array(z.string()).min(1, "Choice requests must have at least one option"),
	multiSelect: z.boolean().optional()
});
/** Confirm input request - boolean yes/no question */
const ConfirmInputSchema = InputRequestBaseSchema.extend({ type: z.literal("confirm") });
/**
* Schema for an input request stored in Y.Doc.
* Uses discriminated union on 'type' field to ensure:
* - 'choice' type REQUIRES options array
* - Other types don't have options
*
* Follows CRDT patterns from existing Shipyard schemas.
*/
const InputRequestSchema = z.discriminatedUnion("type", [
	TextInputSchema,
	MultilineInputSchema,
	ChoiceInputSchema,
	ConfirmInputSchema
]);
/**
* Create a new input request with auto-generated fields.
* Sets id, createdAt, and status to initial values.
*
* @param params - Request parameters (discriminated by type)
* @returns Complete InputRequest ready to store in Y.Doc
*/
function createInputRequest(params) {
	const baseFields = {
		id: nanoid(),
		createdAt: Date.now(),
		message: params.message,
		defaultValue: params.defaultValue,
		status: "pending",
		timeout: params.timeout,
		planId: params.planId
	};
	let request;
	switch (params.type) {
		case "text":
			request = {
				...baseFields,
				type: "text"
			};
			break;
		case "multiline":
			request = {
				...baseFields,
				type: "multiline"
			};
			break;
		case "choice":
			request = {
				...baseFields,
				type: "choice",
				options: params.options,
				multiSelect: params.multiSelect
			};
			break;
		case "confirm":
			request = {
				...baseFields,
				type: "confirm"
			};
			break;
	}
	const parseResult = InputRequestSchema.safeParse(request);
	if (!parseResult.success) throw new Error(`Invalid input request: ${parseResult.error.issues[0]?.message}`);
	return parseResult.data;
}

//#endregion
//#region src/yjs-keys.ts
/**
* Shared Y.Doc key constants to prevent typos and mismatches.
*
* CRITICAL: These keys define the structure of the Y.Doc CRDT.
* All parts of the codebase (server, web, tests) MUST use these constants
* to ensure data is written to and read from the same locations.
*
* @see docs/yjs-data-model.md for detailed explanation of each key
*/
/**
* Y.Doc keys used across the application.
* Using `as const` makes these literal types for better type safety.
*/
const YDOC_KEYS = {
	METADATA: "metadata",
	DOCUMENT_FRAGMENT: "document",
	THREADS: "threads",
	STEP_COMPLETIONS: "stepCompletions",
	PLANS: "plans",
	ARTIFACTS: "artifacts",
	DELIVERABLES: "deliverables",
	PRESENCE: "presence",
	LINKED_PRS: "linkedPRs",
	PR_REVIEW_COMMENTS: "prReviewComments",
	EVENTS: "events",
	SNAPSHOTS: "snapshots",
	INPUT_REQUESTS: "inputRequests"
};
/**
* Helper to validate a key is one of the known Y.Doc keys.
* Useful for runtime validation when keys come from external sources.
*/
function isValidYDocKey(key) {
	return Object.values(YDOC_KEYS).includes(key);
}

//#endregion
//#region src/thread.ts
/**
* Zod schema for comment body - can be a string or structured content.
* BlockNote stores comment bodies as arrays of block content.
*/
const CommentBodySchema = z.union([z.string(), z.array(z.unknown())]);
/**
* Zod schema for thread comment validation.
*/
const ThreadCommentSchema = z.object({
	id: z.string(),
	userId: z.string(),
	body: CommentBodySchema,
	createdAt: z.number()
});
/**
* Zod schema for thread validation.
*/
const ThreadSchema = z.object({
	id: z.string(),
	comments: z.array(ThreadCommentSchema),
	resolved: z.boolean().optional(),
	selectedText: z.string().optional()
});
/**
* Type guard for checking if a value is a valid Thread.
*/
function isThread(value) {
	return ThreadSchema.safeParse(value).success;
}
/**
* Safely parse threads from Y.Map data.
* Returns only valid threads, silently dropping invalid ones.
*/
function parseThreads(data) {
	const threads = [];
	for (const [_key, value] of Object.entries(data)) {
		const result = ThreadSchema.safeParse(value);
		if (result.success) threads.push(result.data);
	}
	return threads;
}
/**
* Extract plain text from BlockNote comment body.
* Handles both string and structured block content.
*/
function extractTextFromCommentBody(body) {
	if (typeof body === "string") return body;
	if (!Array.isArray(body)) return "";
	return body.map((block) => {
		if (typeof block === "string") return block;
		if (typeof block !== "object" || block === null) return "";
		const blockObj = block;
		if (Array.isArray(blockObj.content)) return blockObj.content.map((item) => {
			if (typeof item === "string") return item;
			if (typeof item === "object" && item !== null && "text" in item) return item.text;
			return "";
		}).join("");
		return "";
	}).join("\n");
}
/**
* Extract @mentions from comment body.
* Looks for patterns like @username in the text.
*
* @param body - Comment body (string or structured content)
* @returns Array of mentioned GitHub usernames (without @ prefix)
*/
function extractMentions(body) {
	const text = extractTextFromCommentBody(body);
	const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
	const mentions = [];
	let match;
	while ((match = mentionRegex.exec(text)) !== null) if (match[1]) mentions.push(match[1]);
	return [...new Set(mentions)];
}

//#endregion
//#region src/yjs-helpers.ts
/**
* Valid status transitions in the plan lifecycle.
*
* Flow: draft -> (pending_review | in_progress) <-> changes_requested -> in_progress -> completed
*
* Plans can go directly from draft to in_progress if approval is not required.
* Plans requiring approval must go through: draft -> pending_review -> in_progress.
*
* Each transition requires specific fields to be provided.
*/
const VALID_STATUS_TRANSITIONS = {
	draft: ["pending_review", "in_progress"],
	pending_review: ["in_progress", "changes_requested"],
	changes_requested: ["pending_review", "in_progress"],
	in_progress: ["completed"],
	completed: []
};
/**
* Get plan metadata from Y.Doc with validation.
* @returns PlanMetadata if valid, null if data is missing or invalid.
* @deprecated Use getPlanMetadataWithValidation for error details.
*/
function getPlanMetadata(ydoc) {
	const result = getPlanMetadataWithValidation(ydoc);
	return result.success ? result.data : null;
}
/**
* Get plan metadata from Y.Doc with detailed validation errors.
* Surfaces corruption errors instead of silently swallowing them.
*/
function getPlanMetadataWithValidation(ydoc) {
	const data = ydoc.getMap(YDOC_KEYS.METADATA).toJSON();
	if (!data || Object.keys(data).length === 0) return {
		success: false,
		error: "No metadata found in Y.Doc"
	};
	const result = PlanMetadataSchema.safeParse(data);
	if (!result.success) return {
		success: false,
		error: `Invalid metadata: ${result.error.message}`
	};
	return {
		success: true,
		data: result.data
	};
}
/**
* Update plan metadata base fields (non-status fields).
* Use transitionPlanStatus() for status changes.
*
* This function only allows updating fields that don't have status invariants.
* Status changes must go through transitionPlanStatus() to ensure valid transitions.
*/
function setPlanMetadata(ydoc, metadata, actor) {
	ydoc.transact(() => {
		const map = ydoc.getMap(YDOC_KEYS.METADATA);
		for (const [key, value] of Object.entries(metadata)) if (value !== void 0) map.set(key, value);
		map.set("updatedAt", Date.now());
	}, actor ? { actor } : void 0);
}
/**
* Apply pending_review transition fields to metadata map.
*/
function applyPendingReviewTransition(map, transition) {
	map.set("reviewRequestId", transition.reviewRequestId);
}
/**
* Apply changes_requested transition fields to metadata map.
*/
function applyChangesRequestedTransition(map, transition) {
	map.set("reviewedAt", transition.reviewedAt);
	map.set("reviewedBy", transition.reviewedBy);
	if (transition.reviewComment !== void 0) map.set("reviewComment", transition.reviewComment);
}
/**
* Apply in_progress transition fields to metadata map.
*/
function applyInProgressTransition(map, transition) {
	if (transition.reviewedAt !== void 0) map.set("reviewedAt", transition.reviewedAt);
	if (transition.reviewedBy !== void 0) map.set("reviewedBy", transition.reviewedBy);
	if (transition.reviewComment !== void 0) map.set("reviewComment", transition.reviewComment);
}
/**
* Apply completed transition fields to metadata map.
*/
function applyCompletedTransition(map, transition) {
	map.set("completedAt", transition.completedAt);
	map.set("completedBy", transition.completedBy);
	if (transition.snapshotUrl !== void 0) map.set("snapshotUrl", transition.snapshotUrl);
}
/**
* Apply status-specific transition fields to metadata map.
*/
function applyStatusTransitionFields(map, transition) {
	switch (transition.status) {
		case "pending_review":
			applyPendingReviewTransition(map, transition);
			break;
		case "changes_requested":
			applyChangesRequestedTransition(map, transition);
			break;
		case "in_progress":
			applyInProgressTransition(map, transition);
			break;
		case "completed":
			applyCompletedTransition(map, transition);
			break;
		default: assertNever(transition);
	}
}
/**
* Transition plan status with state machine validation.
* Enforces valid status transitions and ensures required fields are provided.
*
* Valid transitions:
* - draft -> pending_review (requires reviewRequestId)
* - pending_review -> in_progress (requires reviewedAt, reviewedBy)
* - pending_review -> changes_requested (requires reviewedAt, reviewedBy, optional reviewComment)
* - changes_requested -> pending_review (requires reviewRequestId)
* - in_progress -> completed (requires completedAt, completedBy, optional snapshotUrl)
*/
function transitionPlanStatus(ydoc, transition, actor) {
	const metadataResult = getPlanMetadataWithValidation(ydoc);
	if (!metadataResult.success) return {
		success: false,
		error: metadataResult.error
	};
	const currentStatus = metadataResult.data.status;
	const validTargets = VALID_STATUS_TRANSITIONS[currentStatus];
	if (!validTargets.includes(transition.status)) return {
		success: false,
		error: `Invalid transition: cannot go from '${currentStatus}' to '${transition.status}'. Valid targets: ${validTargets.join(", ") || "none (terminal state)"}`
	};
	ydoc.transact(() => {
		const map = ydoc.getMap(YDOC_KEYS.METADATA);
		map.set("status", transition.status);
		applyStatusTransitionFields(map, transition);
		map.set("updatedAt", Date.now());
	}, actor ? { actor } : void 0);
	return { success: true };
}
function initPlanMetadata(ydoc, init) {
	const map = ydoc.getMap(YDOC_KEYS.METADATA);
	const now = Date.now();
	map.set("id", init.id);
	map.set("title", init.title);
	map.set("status", "draft");
	map.set("createdAt", now);
	map.set("updatedAt", now);
	if (init.repo) map.set("repo", init.repo);
	if (init.pr) map.set("pr", init.pr);
	if (init.ownerId) {
		map.set("ownerId", init.ownerId);
		map.set("approvedUsers", [init.ownerId]);
		map.set("approvalRequired", init.approvalRequired ?? true);
	}
	if (init.sessionTokenHash) map.set("sessionTokenHash", init.sessionTokenHash);
	if (init.origin) map.set("origin", init.origin);
	if (init.tags) map.set("tags", init.tags);
	const result = getPlanMetadataWithValidation(ydoc);
	if (!result.success) throw new Error(`Failed to initialize metadata: ${result.error}`);
}
function getStepCompletions(ydoc) {
	const steps = ydoc.getMap("stepCompletions");
	return new Map(steps.entries());
}
function toggleStepCompletion(ydoc, stepId, actor) {
	ydoc.transact(() => {
		const steps = ydoc.getMap("stepCompletions");
		const current = steps.get(stepId) || false;
		steps.set(stepId, !current);
	}, actor ? { actor } : void 0);
}
function isStepCompleted(ydoc, stepId) {
	return ydoc.getMap("stepCompletions").get(stepId) || false;
}
function getArtifacts(ydoc) {
	return ydoc.getArray(YDOC_KEYS.ARTIFACTS).toJSON().map((item) => {
		if (!item || typeof item !== "object") return null;
		const artifact = item;
		if (artifact.url && !artifact.storage) return {
			...artifact,
			storage: "github"
		};
		if (!artifact.storage && !artifact.url && !artifact.localArtifactId) return null;
		return artifact;
	}).filter((item) => item !== null).map((item) => ArtifactSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
function addArtifact(ydoc, artifact, actor) {
	const validated = ArtifactSchema.parse(artifact);
	ydoc.transact(() => {
		ydoc.getArray(YDOC_KEYS.ARTIFACTS).push([validated]);
	}, actor ? { actor } : void 0);
}
function removeArtifact(ydoc, artifactId) {
	const array = ydoc.getArray(YDOC_KEYS.ARTIFACTS);
	const index = array.toJSON().findIndex((a) => a.id === artifactId);
	if (index === -1) return false;
	array.delete(index, 1);
	return true;
}
function getAgentPresences(ydoc) {
	const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
	const result = /* @__PURE__ */ new Map();
	for (const [sessionId, value] of map.entries()) {
		const parsed = AgentPresenceSchema.safeParse(value);
		if (parsed.success) result.set(sessionId, parsed.data);
	}
	return result;
}
function setAgentPresence(ydoc, presence, actor) {
	const validated = AgentPresenceSchema.parse(presence);
	ydoc.transact(() => {
		ydoc.getMap(YDOC_KEYS.PRESENCE).set(validated.sessionId, validated);
	}, actor ? { actor } : void 0);
}
function clearAgentPresence(ydoc, sessionId) {
	const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
	if (!map.has(sessionId)) return false;
	map.delete(sessionId);
	return true;
}
function getAgentPresence(ydoc, sessionId) {
	const value = ydoc.getMap(YDOC_KEYS.PRESENCE).get(sessionId);
	if (!value) return null;
	const parsed = AgentPresenceSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}
function getDeliverables(ydoc) {
	return ydoc.getArray(YDOC_KEYS.DELIVERABLES).toJSON().map((item) => DeliverableSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
function addDeliverable(ydoc, deliverable, actor) {
	const validated = DeliverableSchema.parse(deliverable);
	ydoc.transact(() => {
		ydoc.getArray(YDOC_KEYS.DELIVERABLES).push([validated]);
	}, actor ? { actor } : void 0);
}
function linkArtifactToDeliverable(ydoc, deliverableId, artifactId, actor) {
	const array = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
	const deliverables = array.toJSON();
	const index = deliverables.findIndex((d) => d.id === deliverableId);
	if (index === -1) return false;
	const existing = deliverables[index];
	if (!existing) return false;
	const updated = {
		id: existing.id,
		text: existing.text,
		linkedArtifactId: artifactId,
		linkedAt: Date.now()
	};
	ydoc.transact(() => {
		array.delete(index, 1);
		array.insert(index, [updated]);
	}, actor ? { actor } : void 0);
	return true;
}
function getPlanOwnerId(ydoc) {
	const ownerId = ydoc.getMap(YDOC_KEYS.METADATA).get("ownerId");
	return typeof ownerId === "string" ? ownerId : null;
}
function isApprovalRequired(ydoc) {
	const map = ydoc.getMap(YDOC_KEYS.METADATA);
	const approvalRequired = map.get("approvalRequired");
	if (typeof approvalRequired === "boolean") return approvalRequired;
	const ownerId = map.get("ownerId");
	return typeof ownerId === "string" && ownerId.length > 0;
}
function getApprovedUsers(ydoc) {
	const approvedUsers = ydoc.getMap(YDOC_KEYS.METADATA).get("approvedUsers");
	if (!Array.isArray(approvedUsers)) return [];
	return approvedUsers.filter((id) => typeof id === "string");
}
function isUserApproved(ydoc, userId) {
	if (getPlanOwnerId(ydoc) === userId) return true;
	return getApprovedUsers(ydoc).includes(userId);
}
function approveUser(ydoc, userId, actor) {
	const currentApproved = getApprovedUsers(ydoc);
	if (currentApproved.includes(userId)) return;
	ydoc.transact(() => {
		const map = ydoc.getMap(YDOC_KEYS.METADATA);
		map.set("approvedUsers", [...currentApproved, userId]);
		map.set("updatedAt", Date.now());
	}, actor ? { actor } : void 0);
}
function revokeUser(ydoc, userId, actor) {
	if (userId === getPlanOwnerId(ydoc)) return false;
	const currentApproved = getApprovedUsers(ydoc);
	if (currentApproved.indexOf(userId) === -1) return false;
	ydoc.transact(() => {
		const map = ydoc.getMap(YDOC_KEYS.METADATA);
		map.set("approvedUsers", currentApproved.filter((id) => id !== userId));
		map.set("updatedAt", Date.now());
	}, actor ? { actor } : void 0);
	return true;
}
function getRejectedUsers(ydoc) {
	const rejectedUsers = ydoc.getMap(YDOC_KEYS.METADATA).get("rejectedUsers");
	if (!Array.isArray(rejectedUsers)) return [];
	return rejectedUsers.filter((id) => typeof id === "string");
}
function isUserRejected(ydoc, userId) {
	return getRejectedUsers(ydoc).includes(userId);
}
function rejectUser(ydoc, userId, actor) {
	if (userId === getPlanOwnerId(ydoc)) return;
	const currentRejected = getRejectedUsers(ydoc);
	const currentApproved = getApprovedUsers(ydoc);
	ydoc.transact(() => {
		const map = ydoc.getMap(YDOC_KEYS.METADATA);
		if (!currentRejected.includes(userId)) map.set("rejectedUsers", [...currentRejected, userId]);
		if (currentApproved.includes(userId)) map.set("approvedUsers", currentApproved.filter((id) => id !== userId));
		map.set("updatedAt", Date.now());
	}, actor ? { actor } : void 0);
}
function unrejectUser(ydoc, userId, actor) {
	const currentRejected = getRejectedUsers(ydoc);
	if (currentRejected.indexOf(userId) === -1) return false;
	ydoc.transact(() => {
		const map = ydoc.getMap(YDOC_KEYS.METADATA);
		map.set("rejectedUsers", currentRejected.filter((id) => id !== userId));
		map.set("updatedAt", Date.now());
	}, actor ? { actor } : void 0);
	return true;
}
function getLinkedPRs(ydoc) {
	return ydoc.getArray(YDOC_KEYS.LINKED_PRS).toJSON().map((item) => LinkedPRSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
function linkPR(ydoc, pr, actor) {
	const validated = LinkedPRSchema.parse(pr);
	ydoc.transact(() => {
		const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
		const index = array.toJSON().findIndex((p) => p.prNumber === validated.prNumber);
		if (index !== -1) array.delete(index, 1);
		array.push([validated]);
	}, actor ? { actor } : void 0);
}
function unlinkPR(ydoc, prNumber) {
	const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
	const index = array.toJSON().findIndex((p) => p.prNumber === prNumber);
	if (index === -1) return false;
	array.delete(index, 1);
	return true;
}
function getLinkedPR(ydoc, prNumber) {
	return getLinkedPRs(ydoc).find((pr) => pr.prNumber === prNumber) ?? null;
}
function updateLinkedPRStatus(ydoc, prNumber, status) {
	const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
	const existing = array.toJSON();
	const index = existing.findIndex((p) => p.prNumber === prNumber);
	if (index === -1) return false;
	const pr = existing[index];
	if (!pr) return false;
	array.delete(index, 1);
	array.insert(index, [{
		...pr,
		status
	}]);
	return true;
}
function getPRReviewComments(ydoc) {
	return ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS).toJSON().map((item) => PRReviewCommentSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
function getPRReviewCommentsForPR(ydoc, prNumber) {
	return getPRReviewComments(ydoc).filter((c) => c.prNumber === prNumber);
}
function addPRReviewComment(ydoc, comment, actor) {
	const validated = PRReviewCommentSchema.parse(comment);
	ydoc.transact(() => {
		ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS).push([validated]);
	}, actor ? { actor } : void 0);
}
function resolvePRReviewComment(ydoc, commentId, resolved) {
	const array = ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS);
	const existing = array.toJSON();
	const index = existing.findIndex((c) => c.id === commentId);
	if (index === -1) return false;
	const comment = existing[index];
	if (!comment) return false;
	array.delete(index, 1);
	array.insert(index, [{
		...comment,
		resolved
	}]);
	return true;
}
function removePRReviewComment(ydoc, commentId) {
	const array = ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS);
	const index = array.toJSON().findIndex((c) => c.id === commentId);
	if (index === -1) return false;
	array.delete(index, 1);
	return true;
}
function markPlanAsViewed(ydoc, username) {
	const map = ydoc.getMap(YDOC_KEYS.METADATA);
	ydoc.transact(() => {
		const existingViewedBy = map.get("viewedBy");
		let viewedBy = {};
		if (existingViewedBy instanceof Y.Map) {
			for (const [key, value] of existingViewedBy.entries()) if (typeof value === "number") viewedBy[key] = value;
		} else if (existingViewedBy && typeof existingViewedBy === "object") viewedBy = { ...existingViewedBy };
		viewedBy[username] = Date.now();
		const viewedByMap = new Y.Map();
		for (const [user, timestamp] of Object.entries(viewedBy)) viewedByMap.set(user, timestamp);
		map.set("viewedBy", viewedByMap);
	});
}
function getViewedBy(ydoc) {
	const viewedBy = ydoc.getMap(YDOC_KEYS.METADATA).get("viewedBy");
	if (!viewedBy) return {};
	if (viewedBy instanceof Y.Map) {
		const result = {};
		for (const [key, value] of viewedBy.entries()) if (typeof value === "number") result[key] = value;
		return result;
	}
	if (typeof viewedBy === "object") return viewedBy;
	return {};
}
function isPlanUnread(metadata, username, viewedBy) {
	const lastViewed = (viewedBy ?? {})[username];
	if (!lastViewed) return true;
	return lastViewed < metadata.updatedAt;
}
function getConversationVersions(ydoc) {
	return getPlanMetadata(ydoc)?.conversationVersions || [];
}
function addConversationVersion(ydoc, version, actor) {
	const validated = ConversationVersionSchema.parse(version);
	ydoc.transact(() => {
		const metadata = ydoc.getMap(YDOC_KEYS.METADATA);
		const versions = metadata.get("conversationVersions") || [];
		metadata.set("conversationVersions", [...versions, validated]);
	}, actor ? { actor } : void 0);
}
function markVersionHandedOff(ydoc, versionId, handedOffTo, actor) {
	const updated = getConversationVersions(ydoc).map((v) => {
		if (v.versionId !== versionId) return v;
		const handedOffVersion = {
			...v,
			handedOff: true,
			handedOffAt: Date.now(),
			handedOffTo
		};
		return ConversationVersionSchema.parse(handedOffVersion);
	});
	ydoc.transact(() => {
		ydoc.getMap(YDOC_KEYS.METADATA).set("conversationVersions", updated);
	}, actor ? { actor } : void 0);
}
/**
* Log a plan event with type-safe data payload.
* TypeScript will enforce that the data parameter matches the event type.
* @returns The ID of the created event (either provided or generated)
*/
function logPlanEvent(ydoc, type, actor, ...args) {
	const eventsArray = ydoc.getArray(YDOC_KEYS.EVENTS);
	const [data, options] = args;
	const eventId = options?.id ?? nanoid();
	const baseEvent = {
		id: eventId,
		type,
		actor,
		timestamp: Date.now(),
		inboxWorthy: options?.inboxWorthy,
		inboxFor: options?.inboxFor
	};
	const rawEvent = data !== void 0 ? {
		...baseEvent,
		data
	} : baseEvent;
	const parsed = PlanEventSchema.safeParse(rawEvent);
	if (!parsed.success) throw new Error(`Invalid plan event: ${parsed.error.message}`);
	eventsArray.push([parsed.data]);
	return eventId;
}
function getPlanEvents(ydoc) {
	return ydoc.getArray(YDOC_KEYS.EVENTS).toJSON().map((item) => PlanEventSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
/**
* Get all snapshots from the Y.Doc.
* Returns snapshots sorted by createdAt (oldest first).
*/
function getSnapshots(ydoc) {
	return ydoc.getArray(YDOC_KEYS.SNAPSHOTS).toJSON().map((item) => PlanSnapshotSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data).sort((a, b) => a.createdAt - b.createdAt);
}
/**
* Add a snapshot to the Y.Doc.
* Snapshots are append-only for CRDT correctness.
*/
function addSnapshot(ydoc, snapshot, actor) {
	const validated = PlanSnapshotSchema.parse(snapshot);
	ydoc.transact(() => {
		ydoc.getArray(YDOC_KEYS.SNAPSHOTS).push([validated]);
	}, actor ? { actor } : void 0);
}
/**
* Create a snapshot of the current plan state.
* Captures content, thread summary, artifacts, and deliverables.
*
* @param ydoc - The Y.Doc containing the plan
* @param reason - Why this snapshot was created (e.g., "Approved by reviewer")
* @param actor - Who triggered the snapshot (agent or human name)
* @param status - The plan status at time of snapshot
* @param blocks - The content blocks (BlockNote Block[])
* @returns The created snapshot (not yet added to Y.Doc - call addSnapshot separately)
*/
function createPlanSnapshot(ydoc, reason, actor, status, blocks) {
	const threads = parseThreads(ydoc.getMap(YDOC_KEYS.THREADS).toJSON());
	const unresolved = threads.filter((t) => !t.resolved).length;
	const artifacts = getArtifacts(ydoc);
	const deliverables = getDeliverables(ydoc);
	return {
		id: nanoid(),
		status,
		createdBy: actor,
		reason,
		createdAt: Date.now(),
		content: blocks,
		threadSummary: threads.length > 0 ? {
			total: threads.length,
			unresolved
		} : void 0,
		artifacts: artifacts.length > 0 ? artifacts : void 0,
		deliverables: deliverables.length > 0 ? deliverables : void 0
	};
}
/**
* Get the latest snapshot from the Y.Doc.
* Returns null if no snapshots exist.
*/
function getLatestSnapshot(ydoc) {
	const snapshots = getSnapshots(ydoc);
	if (snapshots.length === 0) return null;
	return snapshots[snapshots.length - 1] ?? null;
}
/**
* Add a tag to a plan (automatically normalizes and deduplicates).
* Tags are normalized to lowercase and trimmed to prevent duplicates.
*/
function addPlanTag(ydoc, tag, actor) {
	ydoc.transact(() => {
		const map = ydoc.getMap(YDOC_KEYS.METADATA);
		const currentTags = map.get("tags") || [];
		const normalizedTag = tag.toLowerCase().trim();
		if (!normalizedTag || currentTags.includes(normalizedTag)) return;
		map.set("tags", [...currentTags, normalizedTag]);
		map.set("updatedAt", Date.now());
	}, actor ? { actor } : void 0);
}
/**
* Remove a tag from a plan.
*/
function removePlanTag(ydoc, tag, actor) {
	ydoc.transact(() => {
		const map = ydoc.getMap(YDOC_KEYS.METADATA);
		const currentTags = map.get("tags") || [];
		const normalizedTag = tag.toLowerCase().trim();
		map.set("tags", currentTags.filter((t) => t !== normalizedTag));
		map.set("updatedAt", Date.now());
	}, actor ? { actor } : void 0);
}
/**
* Get all unique tags from a list of plan index entries (for autocomplete).
* Returns sorted array of unique tags.
*/
function getAllTagsFromIndex(indexEntries) {
	const tagSet = /* @__PURE__ */ new Set();
	for (const entry of indexEntries) if (entry.tags) for (const tag of entry.tags) tagSet.add(tag);
	return Array.from(tagSet).sort();
}
/**
* Archive a plan - marks it as archived with timestamp and actor.
* Validates that the plan exists and is not already archived.
*/
function archivePlan(ydoc, actorId) {
	const metadata = getPlanMetadata(ydoc);
	if (!metadata) return {
		success: false,
		error: "Plan metadata not found"
	};
	if (metadata.archivedAt) return {
		success: false,
		error: "Plan is already archived"
	};
	ydoc.transact(() => {
		const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
		metadataMap.set("archivedAt", Date.now());
		metadataMap.set("archivedBy", actorId);
		metadataMap.set("updatedAt", Date.now());
	}, { actor: actorId });
	return { success: true };
}
/**
* Unarchive a plan - removes archived status.
* Validates that the plan exists and is currently archived.
*/
function unarchivePlan(ydoc, actorId) {
	const metadata = getPlanMetadata(ydoc);
	if (!metadata) return {
		success: false,
		error: "Plan metadata not found"
	};
	if (!metadata.archivedAt) return {
		success: false,
		error: "Plan is not archived"
	};
	ydoc.transact(() => {
		const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
		metadataMap.delete("archivedAt");
		metadataMap.delete("archivedBy");
		metadataMap.set("updatedAt", Date.now());
	}, { actor: actorId });
	return { success: true };
}
/**
* Answer a pending input request with validation.
* Used by browser UI when user responds to input request modal.
*/
function answerInputRequest(ydoc, requestId, response, answeredBy) {
	const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
	const requests = requestsArray.toJSON();
	const index = requests.findIndex((r) => r.id === requestId);
	if (index === -1) return {
		success: false,
		error: "Request not found"
	};
	const request = requests[index];
	if (!request) return {
		success: false,
		error: "Request not found"
	};
	if (request.status !== "pending") return {
		success: false,
		error: `Request is not pending`
	};
	const answeredRequest = {
		...request,
		status: "answered",
		response,
		answeredAt: Date.now(),
		answeredBy
	};
	const validated = InputRequestSchema.parse(answeredRequest);
	ydoc.transact(() => {
		requestsArray.delete(index, 1);
		requestsArray.insert(index, [validated]);
	});
	return { success: true };
}
/**
* Cancel a pending input request.
* Used when user closes modal without responding.
*/
function cancelInputRequest(ydoc, requestId) {
	const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
	const requests = requestsArray.toJSON();
	const index = requests.findIndex((r) => r.id === requestId);
	if (index === -1) return {
		success: false,
		error: "Request not found"
	};
	const request = requests[index];
	if (!request) return {
		success: false,
		error: "Request not found"
	};
	if (request.status !== "pending") return {
		success: false,
		error: `Request is not pending`
	};
	const cancelledRequest = {
		...request,
		status: "cancelled"
	};
	const validated = InputRequestSchema.parse(cancelledRequest);
	ydoc.transact(() => {
		requestsArray.delete(index, 1);
		requestsArray.insert(index, [validated]);
	});
	return { success: true };
}

//#endregion
export { toggleStepCompletion as $, getRejectedUsers as A, UpdatePlanContentRequestSchema as At, linkArtifactToDeliverable as B, getLinkedPRs as C, HookApiErrorSchema as Ct, getPlanMetadata as D, ReviewFeedbackSchema as Dt, getPlanEvents as E, ReviewCommentSchema as Et, isApprovalRequired as F, rejectUser as G, logPlanEvent as H, isPlanUnread as I, removePlanTag as J, removeArtifact as K, isStepCompleted as L, getStepCompletions as M, UpdatePresenceRequestSchema as Mt, getViewedBy as N, UpdatePresenceResponseSchema as Nt, getPlanMetadataWithValidation as O, UnregisterServerRequestSchema as Ot, initPlanMetadata as P, assertNever as Pt, setPlanMetadata as Q, isUserApproved as R, getLinkedPR as S, GetReviewStatusResponseSchema as St, getPRReviewCommentsForPR as T, RegisterServerResponseSchema as Tt, markPlanAsViewed as U, linkPR as V, markVersionHandedOff as W, revokeUser as X, resolvePRReviewComment as Y, setAgentPresence as Z, getApprovedUsers as _, AgentPresenceSchema as _t, addPRReviewComment as a, ThreadCommentSchema as at, getDeliverables as b, CreateSubscriptionRequestSchema as bt, answerInputRequest as c, extractTextFromCommentBody as ct, cancelInputRequest as d, YDOC_KEYS as dt, transitionPlanStatus as et, clearAgentPresence as f, isValidYDocKey as ft, getAllTagsFromIndex as g, createInputRequest as gt, getAgentPresences as h, InputRequestTypeValues as ht, addDeliverable as i, updateLinkedPRStatus as it, getSnapshots as j, UpdatePlanContentResponseSchema as jt, getPlanOwnerId as k, UnregisterServerResponseSchema as kt, approveUser as l, isThread as lt, getAgentPresence as m, InputRequestStatusValues as mt, addArtifact as n, unlinkPR as nt, addPlanTag as o, ThreadSchema as ot, createPlanSnapshot as p, InputRequestSchema as pt, removePRReviewComment as q, addConversationVersion as r, unrejectUser as rt, addSnapshot as s, extractMentions as st, VALID_STATUS_TRANSITIONS as t, unarchivePlan as tt, archivePlan as u, parseThreads as ut, getArtifacts as v, CreateHookSessionRequestSchema as vt, getPRReviewComments as w, RegisterServerRequestSchema as wt, getLatestSnapshot as x, CreateSubscriptionResponseSchema as xt, getConversationVersions as y, CreateHookSessionResponseSchema as yt, isUserRejected as z };
//# sourceMappingURL=yjs-helpers-Da2r3318.mjs.map