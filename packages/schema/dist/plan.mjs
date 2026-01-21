import { z } from "zod";
import { nanoid } from "nanoid";

//#region src/plan.ts
/**
* Valid status values for a plan.
*
* Flow: draft → pending_review ⟷ changes_requested (loop) → in_progress → completed
*
* When reviewer approves: pending_review → in_progress (with matching reviewRequestId)
* When reviewer requests changes: pending_review → changes_requested (with matching reviewRequestId)
* Agent fixes and re-submits: changes_requested → pending_review (new reviewRequestId)
*/
const PlanStatusValues = [
	"draft",
	"pending_review",
	"changes_requested",
	"in_progress",
	"completed"
];
/**
* Valid tab/view types for plan content display.
* Used for tab navigation in PlanContent component and URL routing.
*/
const PlanViewTabValues = [
	"plan",
	"activity",
	"deliverables",
	"changes"
];
/**
* Supported origin platforms for conversation export.
* Used to identify where a plan/conversation originated.
*/
const OriginPlatformValues = [
	"claude-code",
	"devin",
	"cursor",
	"windsurf",
	"aider",
	"unknown"
];
/**
* Origin metadata for conversation export - discriminated by platform.
* Each platform has different session tracking mechanisms.
*/
const ClaudeCodeOriginMetadataSchema = z.object({
	platform: z.literal("claude-code"),
	sessionId: z.string(),
	transcriptPath: z.string(),
	cwd: z.string().optional()
});
const DevinOriginMetadataSchema = z.object({
	platform: z.literal("devin"),
	sessionId: z.string()
});
const CursorOriginMetadataSchema = z.object({
	platform: z.literal("cursor"),
	conversationId: z.string(),
	generationId: z.string().optional()
});
const UnknownOriginMetadataSchema = z.object({ platform: z.literal("unknown") });
const OriginMetadataSchema = z.discriminatedUnion("platform", [
	ClaudeCodeOriginMetadataSchema,
	DevinOriginMetadataSchema,
	CursorOriginMetadataSchema,
	UnknownOriginMetadataSchema
]);
/**
* Parse and validate Claude Code hook metadata.
* Safely extracts origin fields with runtime validation.
*/
function parseClaudeCodeOrigin(hookMetadata) {
	if (!hookMetadata) return null;
	const result = ClaudeCodeOriginMetadataSchema.safeParse({
		platform: "claude-code",
		sessionId: hookMetadata.originSessionId,
		transcriptPath: hookMetadata.originTranscriptPath,
		cwd: hookMetadata.originCwd
	});
	return result.success ? result.data : null;
}
const ConversationVersionBaseSchema = z.object({
	versionId: z.string(),
	creator: z.string(),
	platform: z.enum(OriginPlatformValues),
	sessionId: z.string(),
	messageCount: z.number(),
	createdAt: z.number()
});
const ConversationVersionSchema = z.discriminatedUnion("handedOff", [ConversationVersionBaseSchema.extend({ handedOff: z.literal(false) }), ConversationVersionBaseSchema.extend({
	handedOff: z.literal(true),
	handedOffAt: z.number(),
	handedOffTo: z.string()
})]);
const PlanEventTypes = [
	"plan_created",
	"status_changed",
	"comment_added",
	"comment_resolved",
	"artifact_uploaded",
	"deliverable_linked",
	"pr_linked",
	"content_edited",
	"approved",
	"changes_requested",
	"completed",
	"conversation_imported",
	"conversation_handed_off",
	"step_completed",
	"plan_archived",
	"plan_unarchived",
	"conversation_exported",
	"plan_shared",
	"approval_requested",
	"input_request_created",
	"input_request_answered",
	"input_request_declined",
	"agent_activity"
];
/**
* Agent activity types for tracking agent work status and updates.
* Used in agent_activity events to communicate agent state to humans.
*/
const AgentActivityTypes = [
	"help_request",
	"help_request_resolved",
	"blocker",
	"blocker_resolved"
];
/** Base schema shared by all plan events */
const PlanEventBaseSchema = z.object({
	id: z.string(),
	actor: z.string(),
	timestamp: z.number(),
	inboxWorthy: z.boolean().optional(),
	inboxFor: z.union([z.string(), z.array(z.string())]).optional()
});
/** Zod schema for agent activity data discriminated union */
const AgentActivityDataSchema = z.discriminatedUnion("activityType", [
	z.object({
		activityType: z.literal("help_request"),
		requestId: z.string(),
		message: z.string()
	}),
	z.object({
		activityType: z.literal("help_request_resolved"),
		requestId: z.string(),
		resolution: z.string().optional()
	}),
	z.object({
		activityType: z.literal("blocker"),
		message: z.string(),
		requestId: z.string()
	}),
	z.object({
		activityType: z.literal("blocker_resolved"),
		requestId: z.string(),
		resolution: z.string().optional()
	})
]);
/** Discriminated union schema for plan events */
const PlanEventSchema = z.discriminatedUnion("type", [
	PlanEventBaseSchema.extend({ type: z.enum([
		"plan_created",
		"content_edited",
		"plan_archived",
		"plan_unarchived",
		"plan_shared"
	]) }),
	PlanEventBaseSchema.extend({
		type: z.literal("status_changed"),
		data: z.object({
			fromStatus: z.enum(PlanStatusValues),
			toStatus: z.enum(PlanStatusValues)
		})
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("artifact_uploaded"),
		data: z.object({ artifactId: z.string() })
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("comment_added"),
		data: z.object({
			commentId: z.string().optional(),
			prNumber: z.number().optional(),
			mentions: z.boolean().optional()
		}).optional()
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("comment_resolved"),
		data: z.object({
			commentId: z.string().optional(),
			resolvedCount: z.number().optional()
		}).optional()
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("deliverable_linked"),
		data: z.object({
			deliverableId: z.string().optional(),
			artifactId: z.string().optional(),
			allFulfilled: z.boolean().optional()
		}).optional()
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("pr_linked"),
		data: z.object({
			prNumber: z.number(),
			url: z.string().optional()
		})
	}),
	PlanEventBaseSchema.extend({
		type: z.enum(["approved", "changes_requested"]),
		data: z.object({ comment: z.string().optional() }).optional()
	}),
	PlanEventBaseSchema.extend({ type: z.literal("completed") }),
	PlanEventBaseSchema.extend({
		type: z.literal("step_completed"),
		data: z.object({
			stepId: z.string(),
			completed: z.boolean()
		})
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("conversation_imported"),
		data: z.object({
			sourcePlatform: z.string().optional(),
			messageCount: z.number(),
			sourceSessionId: z.string().optional()
		})
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("conversation_exported"),
		data: z.object({ messageCount: z.number() })
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("conversation_handed_off"),
		data: z.object({
			handedOffTo: z.string(),
			messageCount: z.number()
		})
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("approval_requested"),
		data: z.object({ requesterName: z.string().optional() }).optional()
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("input_request_created"),
		data: z.object({
			requestId: z.string(),
			requestType: z.enum([
				"text",
				"multiline",
				"choice",
				"confirm"
			]),
			requestMessage: z.string()
		})
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("input_request_answered"),
		data: z.object({
			requestId: z.string(),
			response: z.unknown(),
			answeredBy: z.string()
		})
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("input_request_declined"),
		data: z.object({ requestId: z.string() })
	}),
	PlanEventBaseSchema.extend({
		type: z.literal("agent_activity"),
		data: AgentActivityDataSchema
	})
]);
/**
* Check if an event should appear in a user's inbox.
*
* @param event - The event to check
* @param username - GitHub username to check against
* @param ownerId - Optional plan owner's username (needed to resolve 'owner' in inboxFor)
* @returns true if the event is inbox-worthy for this user
*/
function isInboxWorthy(event, username, ownerId) {
	if (!event.inboxWorthy) return false;
	if (!event.inboxFor) return true;
	const resolvedInboxFor = event.inboxFor === "owner" && ownerId ? ownerId : event.inboxFor;
	if (Array.isArray(resolvedInboxFor)) return resolvedInboxFor.includes(username);
	return resolvedInboxFor === username;
}
/** Base schema shared by all statuses */
const PlanMetadataBaseSchema = z.object({
	id: z.string(),
	title: z.string(),
	createdAt: z.number(),
	updatedAt: z.number(),
	repo: z.string().optional(),
	pr: z.number().optional(),
	ownerId: z.string().optional(),
	approvalRequired: z.boolean().optional(),
	approvedUsers: z.array(z.string()).optional(),
	rejectedUsers: z.array(z.string()).optional(),
	sessionTokenHash: z.string().optional(),
	archivedAt: z.number().optional(),
	archivedBy: z.string().optional(),
	origin: OriginMetadataSchema.optional(),
	viewedBy: z.record(z.string(), z.number()).optional(),
	conversationVersions: z.array(ConversationVersionSchema).optional(),
	events: z.array(PlanEventSchema).optional(),
	tags: z.array(z.string()).optional()
});
const PlanMetadataSchema = z.discriminatedUnion("status", [
	PlanMetadataBaseSchema.extend({ status: z.literal("draft") }),
	PlanMetadataBaseSchema.extend({
		status: z.literal("pending_review"),
		reviewRequestId: z.string()
	}),
	PlanMetadataBaseSchema.extend({
		status: z.literal("changes_requested"),
		reviewedAt: z.number(),
		reviewedBy: z.string(),
		reviewComment: z.string().optional()
	}),
	PlanMetadataBaseSchema.extend({
		status: z.literal("in_progress"),
		reviewedAt: z.number(),
		reviewedBy: z.string(),
		reviewComment: z.string().optional()
	}),
	PlanMetadataBaseSchema.extend({
		status: z.literal("completed"),
		completedAt: z.number(),
		completedBy: z.string(),
		snapshotUrl: z.string().optional()
	})
]);
const BaseArtifactSchema = z.object({
	id: z.string(),
	type: z.enum([
		"screenshot",
		"video",
		"test_results",
		"diff"
	]),
	filename: z.string(),
	description: z.string().optional(),
	uploadedAt: z.number().optional()
});
const GitHubArtifactSchema = BaseArtifactSchema.extend({
	storage: z.literal("github"),
	url: z.string()
});
const LocalArtifactSchema = BaseArtifactSchema.extend({
	storage: z.literal("local"),
	localArtifactId: z.string()
});
const ArtifactSchema = z.discriminatedUnion("storage", [GitHubArtifactSchema, LocalArtifactSchema]);
function getArtifactUrl(repo, pr, planId, filename) {
	return `https://raw.githubusercontent.com/${repo}/plan-artifacts/pr-${pr}/${planId}/${filename}`;
}
const DeliverableSchema = z.object({
	id: z.string(),
	text: z.string(),
	linkedArtifactId: z.string().optional(),
	linkedAt: z.number().optional()
});
const PlanSnapshotSchema = z.object({
	id: z.string(),
	status: z.enum(PlanStatusValues),
	createdBy: z.string(),
	reason: z.string(),
	createdAt: z.number(),
	content: z.array(z.unknown()),
	threadSummary: z.object({
		total: z.number(),
		unresolved: z.number()
	}).optional(),
	artifacts: z.array(ArtifactSchema).optional(),
	deliverables: z.array(DeliverableSchema).optional()
});
const LinkedPRStatusValues = [
	"draft",
	"open",
	"merged",
	"closed"
];
const LinkedPRSchema = z.object({
	prNumber: z.number(),
	url: z.string(),
	linkedAt: z.number(),
	status: z.enum(LinkedPRStatusValues),
	branch: z.string().optional(),
	title: z.string().optional()
});
const PRReviewCommentSchema = z.object({
	id: z.string(),
	prNumber: z.number(),
	path: z.string(),
	line: z.number(),
	body: z.string(),
	author: z.string(),
	createdAt: z.number(),
	resolved: z.boolean().optional()
});
/**
* Create a LinkedPR object with validation.
* Ensures all required fields are present and valid.
*/
function createLinkedPR(params) {
	const linkedPR = {
		...params,
		linkedAt: params.linkedAt ?? Date.now()
	};
	return LinkedPRSchema.parse(linkedPR);
}
/**
* Create a GitHub artifact with validation.
* Ensures storage discriminator is set correctly.
*/
function createGitHubArtifact(params) {
	const artifact = {
		id: nanoid(),
		...params,
		storage: "github",
		uploadedAt: params.uploadedAt ?? Date.now()
	};
	return ArtifactSchema.parse(artifact);
}
/**
* Create a local artifact with validation.
* Ensures storage discriminator is set correctly.
*/
function createLocalArtifact(params) {
	const artifact = {
		id: nanoid(),
		...params,
		storage: "local",
		uploadedAt: params.uploadedAt ?? Date.now()
	};
	return ArtifactSchema.parse(artifact);
}
/**
* Create initial conversation version with handedOff: false.
* Enforces compile-time type safety for the discriminated union.
*/
function createInitialConversationVersion(params) {
	const version = {
		...params,
		handedOff: false
	};
	return ConversationVersionSchema.parse(version);
}
/**
* Create handed-off conversation version.
* Enforces compile-time type safety for the discriminated union.
*/
function createHandedOffConversationVersion(params) {
	const version = {
		...params,
		handedOff: true
	};
	return ConversationVersionSchema.parse(version);
}

//#endregion
export { AgentActivityDataSchema, AgentActivityTypes, ArtifactSchema, ClaudeCodeOriginMetadataSchema, ConversationVersionSchema, CursorOriginMetadataSchema, DeliverableSchema, DevinOriginMetadataSchema, LinkedPRSchema, LinkedPRStatusValues, OriginMetadataSchema, OriginPlatformValues, PRReviewCommentSchema, PlanEventSchema, PlanEventTypes, PlanMetadataSchema, PlanSnapshotSchema, PlanStatusValues, PlanViewTabValues, UnknownOriginMetadataSchema, createGitHubArtifact, createHandedOffConversationVersion, createInitialConversationVersion, createLinkedPR, createLocalArtifact, getArtifactUrl, isInboxWorthy, parseClaudeCodeOrigin };
//# sourceMappingURL=plan.mjs.map