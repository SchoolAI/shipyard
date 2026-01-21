import { $ as toggleStepCompletion, A as getRejectedUsers, At as UpdatePlanContentRequestSchema, B as linkArtifactToDeliverable, C as getLinkedPRs, Ct as HookApiErrorSchema, D as getPlanMetadata, Dt as ReviewFeedbackSchema, E as getPlanEvents, Et as ReviewCommentSchema, F as isApprovalRequired, G as rejectUser, H as logPlanEvent, I as isPlanUnread, J as removePlanTag, K as removeArtifact, L as isStepCompleted, M as getStepCompletions, Mt as UpdatePresenceRequestSchema, N as getViewedBy, Nt as UpdatePresenceResponseSchema, O as getPlanMetadataWithValidation, Ot as UnregisterServerRequestSchema, P as initPlanMetadata, Pt as assertNever, Q as setPlanMetadata, R as isUserApproved, S as getLinkedPR, St as GetReviewStatusResponseSchema, T as getPRReviewCommentsForPR, Tt as RegisterServerResponseSchema, U as markPlanAsViewed, V as linkPR, W as markVersionHandedOff, X as revokeUser, Y as resolvePRReviewComment, Z as setAgentPresence, _ as getApprovedUsers, _t as AgentPresenceSchema, a as addPRReviewComment, at as ThreadCommentSchema, b as getDeliverables, bt as CreateSubscriptionRequestSchema, c as answerInputRequest, ct as extractTextFromCommentBody, d as cancelInputRequest, dt as YDOC_KEYS, et as transitionPlanStatus, f as clearAgentPresence, ft as isValidYDocKey, g as getAllTagsFromIndex, gt as createInputRequest, h as getAgentPresences, ht as InputRequestTypeValues, i as addDeliverable, it as updateLinkedPRStatus, j as getSnapshots, jt as UpdatePlanContentResponseSchema, k as getPlanOwnerId, kt as UnregisterServerResponseSchema, l as approveUser, lt as isThread, m as getAgentPresence, mt as InputRequestStatusValues, n as addArtifact, nt as unlinkPR, o as addPlanTag, ot as ThreadSchema, p as createPlanSnapshot, pt as InputRequestSchema, q as removePRReviewComment, r as addConversationVersion, rt as unrejectUser, s as addSnapshot, st as extractMentions, t as VALID_STATUS_TRANSITIONS, tt as unarchivePlan, u as archivePlan, ut as parseThreads, v as getArtifacts, vt as CreateHookSessionRequestSchema, w as getPRReviewComments, wt as RegisterServerRequestSchema, x as getLatestSnapshot, xt as CreateSubscriptionResponseSchema, y as getConversationVersions, yt as CreateHookSessionResponseSchema, z as isUserRejected } from "./yjs-helpers-Da2r3318.mjs";
import { AgentActivityDataSchema, AgentActivityTypes, ArtifactSchema, ClaudeCodeOriginMetadataSchema, ConversationVersionSchema, CursorOriginMetadataSchema, DeliverableSchema, DevinOriginMetadataSchema, LinkedPRSchema, LinkedPRStatusValues, OriginMetadataSchema, OriginPlatformValues, PRReviewCommentSchema, PlanEventSchema, PlanEventTypes, PlanMetadataSchema, PlanSnapshotSchema, PlanStatusValues, PlanViewTabValues, createGitHubArtifact, createHandedOffConversationVersion, createInitialConversationVersion, createLinkedPR, createLocalArtifact, getArtifactUrl, isInboxWorthy, parseClaudeCodeOrigin } from "./plan.mjs";
import { createPlanUrl, createPlanUrlWithHistory, decodePlan, encodePlan, getPlanFromUrl, isUrlEncodedPlanV1, isUrlEncodedPlanV2 } from "./url-encoding.mjs";
import { z } from "zod";
import * as Y from "yjs";
import { TRPCError, initTRPC } from "@trpc/server";

//#region src/conversation-export.ts
/**
* Conversation export types and converters for A2A protocol.
*
* This module provides:
* 1. A2A Message schema definitions (following A2A spec)
* 2. Claude Code JSONL transcript parser
* 3. Converter from Claude Code format to A2A format
*
* A2A (Agent-to-Agent) is an emerging protocol for interoperability
* between AI agent platforms. See: https://a2a-protocol.org/latest/specification/
*
* @see Issue #41 - Context Teleportation
*/
/**
* A2A Text Part - plain text content
*/
const A2ATextPartSchema = z.object({
	type: z.literal("text"),
	text: z.string()
});
/**
* A2A Data Part - structured data (JSON)
* Used for tool calls, results, and other structured content
*/
const A2ADataPartSchema = z.object({
	type: z.literal("data"),
	data: z.unknown()
});
/**
* A2A File Part - file reference
* Used for file attachments, images, etc.
*/
const A2AFilePartSchema = z.object({
	type: z.literal("file"),
	uri: z.string(),
	mediaType: z.string().optional(),
	name: z.string().optional()
});
/**
* A2A Part schema - validates any of the three part types
* Uses a custom approach to avoid Zod v4 issues with union arrays
*/
const A2APartSchema = z.object({ type: z.enum([
	"text",
	"data",
	"file"
]) }).passthrough().superRefine((val, ctx) => {
	if (val.type === "text") {
		if (typeof val.text !== "string") ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "text part must have a string text field"
		});
	} else if (val.type === "data") {
		if (!("data" in val)) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "data part must have a data field"
		});
	} else if (val.type === "file") {
		if (typeof val.uri !== "string") ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "file part must have a string uri field"
		});
	}
});
/**
* A2A Message - the core message type
* Represents a single message in a conversation
*
* Uses z.any() for parts array to avoid Zod v4 issues with complex
* union types in arrays. Parts are validated via superRefine.
*/
/**
* Validates A2A parts array manually.
* Returns true if all parts are valid.
*/
function isValidA2APart(part) {
	if (!part || typeof part !== "object") return false;
	const p = part;
	const t$1 = p.type;
	if (t$1 === "text") return typeof p.text === "string";
	else if (t$1 === "data") return "data" in p;
	else if (t$1 === "file") return typeof p.uri === "string";
	return false;
}
function isValidA2AParts(parts) {
	if (!Array.isArray(parts)) return false;
	return parts.every(isValidA2APart);
}
/**
* A2A Message schema - validates the full message structure.
* Uses a custom schema to work around Zod v4 issues with complex union arrays.
*/
const A2AMessageSchema = z.object({
	messageId: z.string(),
	role: z.enum(["user", "agent"]),
	contextId: z.string().optional(),
	taskId: z.string().optional(),
	referenceTaskIds: z.array(z.string()).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	extensions: z.array(z.string()).optional()
}).passthrough().refine((val) => {
	const parts = val.parts;
	return isValidA2AParts(parts);
}, {
	message: "Invalid parts array - each part must have valid type and required fields",
	path: ["parts"]
}).transform((val) => ({
	...val,
	parts: val.parts
}));
/**
* Metadata about a conversation export
*/
const ConversationExportMetaSchema = z.object({
	exportId: z.string(),
	sourcePlatform: z.string(),
	sourceSessionId: z.string(),
	planId: z.string(),
	exportedAt: z.number(),
	messageCount: z.number(),
	compressedBytes: z.number(),
	uncompressedBytes: z.number()
});
z.object({
	type: z.literal("text"),
	text: z.string()
});
z.object({
	type: z.literal("tool_use"),
	id: z.string(),
	name: z.string(),
	input: z.record(z.string(), z.unknown())
});
z.object({
	type: z.literal("tool_result"),
	tool_use_id: z.string(),
	content: z.unknown(),
	is_error: z.boolean().optional()
});
/**
* Claude Code content block schema
* Uses a custom approach to avoid Zod v4 issues with union arrays
*/
const ClaudeCodeContentBlockSchema = z.object({ type: z.enum([
	"text",
	"tool_use",
	"tool_result"
]) }).passthrough().superRefine((val, ctx) => {
	const typedVal = val;
	if (val.type === "text") {
		if (typeof typedVal.text !== "string") ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "text block must have a string text field"
		});
	} else if (val.type === "tool_use") {
		if (typeof typedVal.id !== "string") ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "tool_use block must have a string id field"
		});
		if (typeof typedVal.name !== "string") ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "tool_use block must have a string name field"
		});
		if (typeof typedVal.input !== "object" || typedVal.input === null) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "tool_use block must have an object input field"
		});
	} else if (val.type === "tool_result") {
		if (typeof typedVal.tool_use_id !== "string") ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "tool_result block must have a string tool_use_id field"
		});
	}
});
/**
* Claude Code token usage
*/
const ClaudeCodeUsageSchema = z.object({
	input_tokens: z.number(),
	output_tokens: z.number(),
	cache_creation_input_tokens: z.number().optional(),
	cache_read_input_tokens: z.number().optional()
});
/**
* Claude Code message inner structure
*/
const ClaudeCodeMessageInnerSchema = z.object({
	role: z.string(),
	content: z.array(ClaudeCodeContentBlockSchema),
	id: z.string().optional(),
	model: z.string().optional(),
	usage: ClaudeCodeUsageSchema.optional()
});
/**
* Claude Code JSONL message schema
* This is the full structure of each line in the session.jsonl file
*/
const ClaudeCodeMessageSchema = z.object({
	sessionId: z.string(),
	type: z.enum([
		"user",
		"assistant",
		"summary"
	]),
	message: ClaudeCodeMessageInnerSchema,
	uuid: z.string(),
	timestamp: z.string(),
	parentUuid: z.string().optional(),
	costUSD: z.number().optional(),
	durationMs: z.number().optional()
});
/**
* Parses a Claude Code JSONL transcript from a string.
*
* Each line in the JSONL file is a separate JSON object representing
* a message in the conversation. Malformed lines are captured in errors
* array rather than throwing.
*
* @param content - Raw JSONL string content
* @returns Parsed messages and any parsing errors
*/
function parseClaudeCodeTranscriptString(content) {
	const lines = content.split("\n").filter((line) => line.trim());
	const messages = [];
	const errors = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;
		try {
			const parsed = JSON.parse(line);
			const result = ClaudeCodeMessageSchema.safeParse(parsed);
			if (result.success) messages.push(result.data);
			else errors.push({
				line: i + 1,
				error: `Validation failed: ${result.error.message}`
			});
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			errors.push({
				line: i + 1,
				error: `JSON parse error: ${errorMessage}`
			});
		}
	}
	return {
		messages,
		errors
	};
}
/**
* Type guard helper for exhaustive checking in switch statements
*/
function assertNever$1(x) {
	throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
/**
* Converts a single Claude Code content block to A2A parts.
*
* @param block - Claude Code content block
* @returns Array of A2A parts (may return multiple for complex blocks)
*/
function convertContentBlock(block) {
	switch (block.type) {
		case "text": return [{
			type: "text",
			text: block.text
		}];
		case "tool_use": return [{
			type: "data",
			data: { toolUse: {
				name: block.name,
				id: block.id,
				input: block.input
			} }
		}];
		case "tool_result": return [{
			type: "data",
			data: { toolResult: {
				toolUseId: block.tool_use_id,
				content: block.content,
				isError: block.is_error ?? false
			} }
		}];
		default: return assertNever$1(block);
	}
}
/**
* Converts a single Claude Code message to A2A format.
*
* @param msg - Claude Code message
* @param contextId - Context ID to associate with the message
* @returns A2A message
*/
function convertMessage(msg, contextId) {
	const role = msg.message.role === "user" ? "user" : "agent";
	const parts = msg.message.content.flatMap((block) => convertContentBlock(block));
	return {
		messageId: msg.uuid,
		role,
		parts,
		contextId,
		metadata: {
			timestamp: msg.timestamp,
			platform: "claude-code",
			parentMessageId: msg.parentUuid,
			model: msg.message.model,
			usage: msg.message.usage,
			costUSD: msg.costUSD,
			durationMs: msg.durationMs
		}
	};
}
/**
* Converts an array of Claude Code messages to A2A format.
*
* Filters out 'summary' type messages as they are internal to Claude Code
* and not part of the actual conversation.
*
* @param messages - Array of Claude Code messages
* @param contextId - Context ID to associate with all messages (typically the plan ID)
* @returns Array of A2A messages
*/
function claudeCodeToA2A(messages, contextId) {
	return messages.filter((msg) => msg.type !== "summary").map((msg) => convertMessage(msg, contextId));
}
/**
* Validates an array of A2A messages.
* Useful for validating imported conversations.
*
* @param messages - Array of potential A2A messages
* @returns Validation result with valid messages and errors
*/
function validateA2AMessages(messages) {
	const valid = [];
	const errors = [];
	for (let i = 0; i < messages.length; i++) {
		const result = A2AMessageSchema.safeParse(messages[i]);
		if (result.success) valid.push(result.data);
		else errors.push({
			index: i,
			error: result.error.message
		});
	}
	return {
		valid,
		errors
	};
}
/**
* Get the first text part from a message's parts.
*/
function getFirstTextPart(parts) {
	return parts.filter((p) => p.type === "text")[0];
}
/**
* Extract title from the first user message (truncated to 50 chars).
*/
function extractTitleFromMessage(msg) {
	if (!msg) return "Imported Conversation";
	const firstPart = getFirstTextPart(msg.parts);
	if (!firstPart) return "Imported Conversation";
	const text = firstPart.text;
	return text.length > 50 ? `${text.slice(0, 50)}...` : text;
}
/**
* Check if a data part contains tool use or result.
*/
function isToolDataPart(part) {
	const data = part.data;
	return Boolean(data && typeof data === "object" && ("toolUse" in data || "toolResult" in data));
}
/**
* Count tool interactions in a message's parts.
*/
function countToolInteractions(parts) {
	return parts.filter((p) => p.type === "data").filter(isToolDataPart).length;
}
/**
* Create a summary line for a single message.
*/
function summarizeMessage(msg) {
	const prefix = msg.role === "user" ? "User" : "Agent";
	const firstTextPart = getFirstTextPart(msg.parts);
	if (firstTextPart) return `${prefix}: ${firstTextPart.text.slice(0, 100)}${firstTextPart.text.length > 100 ? "..." : ""}`;
	const toolCount = countToolInteractions(msg.parts);
	if (toolCount > 0) return `${prefix}: [${toolCount} tool interaction(s)]`;
}
/**
* Extracts a brief summary from A2A messages for display purposes.
* Useful when creating a plan from imported conversation.
*
* @param messages - Array of A2A messages
* @param maxMessages - Maximum number of messages to include in summary (default: 3)
* @returns Object with title (first user message) and text (summary of exchange)
*/
function summarizeA2AConversation(messages, maxMessages = 3) {
	const title = extractTitleFromMessage(messages.find((m) => m.role === "user"));
	const summaryLines = messages.slice(0, maxMessages).map(summarizeMessage).filter(Boolean);
	if (messages.length > maxMessages) summaryLines.push(`... and ${messages.length - maxMessages} more messages`);
	return {
		title,
		text: summaryLines.join("\n")
	};
}
function isToolUseData(data) {
	if (!data || typeof data !== "object") return false;
	const d = data;
	if (!d.toolUse || typeof d.toolUse !== "object") return false;
	const toolUse = d.toolUse;
	return typeof toolUse.name === "string" && typeof toolUse.id === "string" && typeof toolUse.input === "object";
}
function isToolResultData(data) {
	if (!data || typeof data !== "object") return false;
	const d = data;
	if (!d.toolResult || typeof d.toolResult !== "object") return false;
	return typeof d.toolResult.toolUseId === "string";
}
/**
* Converts a single A2A part to Claude Code content block(s).
*
* @param part - A2A part to convert
* @returns Array of Claude Code content blocks
*/
function convertA2APartToContentBlock(part) {
	switch (part.type) {
		case "text": return [{
			type: "text",
			text: part.text
		}];
		case "data": {
			const data = part.data;
			if (isToolUseData(data)) return [{
				type: "tool_use",
				id: data.toolUse.id,
				name: data.toolUse.name,
				input: data.toolUse.input
			}];
			if (isToolResultData(data)) return [{
				type: "tool_result",
				tool_use_id: data.toolResult.toolUseId,
				content: data.toolResult.content,
				is_error: data.toolResult.isError
			}];
			return [{
				type: "text",
				text: `[Data: ${JSON.stringify(data)}]`
			}];
		}
		case "file": return [{
			type: "text",
			text: `[File: ${part.name ?? part.uri}${part.mediaType ? ` (${part.mediaType})` : ""}]`
		}];
		default: return assertNever$1(part);
	}
}
/**
* Converts an A2A message to Claude Code format.
*
* @param msg - A2A message to convert
* @param sessionId - Session ID to use for the Claude Code message
* @param parentUuid - Optional parent message UUID
* @returns Claude Code message
*/
function convertA2AToClaudeCodeMessage(msg, sessionId, parentUuid) {
	const role = msg.role === "user" ? "user" : "assistant";
	const type = msg.role === "user" ? "user" : "assistant";
	const content = msg.parts.flatMap(convertA2APartToContentBlock);
	const metadata = msg.metadata || {};
	const timestamp = typeof metadata.timestamp === "string" ? metadata.timestamp : (/* @__PURE__ */ new Date()).toISOString();
	const model = typeof metadata.model === "string" ? metadata.model : void 0;
	const usage = metadata.usage;
	const costUSD = typeof metadata.costUSD === "number" ? metadata.costUSD : void 0;
	const durationMs = typeof metadata.durationMs === "number" ? metadata.durationMs : void 0;
	return {
		sessionId,
		type,
		message: {
			role,
			content,
			...model && { model },
			...usage && { usage }
		},
		uuid: msg.messageId,
		timestamp,
		...parentUuid && { parentUuid },
		...costUSD !== void 0 && { costUSD },
		...durationMs !== void 0 && { durationMs }
	};
}
/**
* Converts an array of A2A messages to Claude Code format.
*
* This is the inverse of claudeCodeToA2A(). It converts A2A messages
* back to the Claude Code JSONL format for import into Claude Code sessions.
*
* @param messages - Array of A2A messages to convert
* @param sessionId - Optional session ID (generates new one if not provided)
* @returns Array of Claude Code messages
*/
function a2aToClaudeCode(messages, sessionId) {
	const resolvedSessionId = sessionId ?? crypto.randomUUID();
	let parentUuid;
	return messages.map((msg) => {
		const claudeMsg = convertA2AToClaudeCodeMessage(msg, resolvedSessionId, parentUuid);
		parentUuid = claudeMsg.uuid;
		return claudeMsg;
	});
}
/**
* Formats an array of Claude Code messages as JSONL string.
*
* Claude Code session files are JSONL (JSON Lines) format where each
* line is a complete JSON object representing one message.
*
* @param messages - Array of Claude Code messages
* @returns JSONL formatted string
*/
function formatAsClaudeCodeJSONL(messages) {
	return messages.map((msg) => JSON.stringify(msg)).join("\n");
}

//#endregion
//#region src/deliverable-formatter.ts
/**
* Format deliverables list for LLM consumption.
* Matches the format used in read_plan tool.
*/
function formatDeliverablesForLLM(deliverables) {
	if (deliverables.length === 0) return "";
	let output = "## Deliverables\n\n";
	output += "Available deliverable IDs for artifact linking:\n\n";
	for (const deliverable of deliverables) {
		const checkbox = deliverable.linkedArtifactId ? "[x]" : "[ ]";
		const linkedInfo = deliverable.linkedArtifactId ? ` (linked to artifact: ${deliverable.linkedArtifactId})` : "";
		output += `- ${checkbox} ${deliverable.text} {id="${deliverable.id}"}${linkedInfo}\n`;
	}
	return output;
}

//#endregion
//#region src/deliverable-parser.ts
/**
* Marker used to identify deliverables in BlockNote content.
* Example: "- [ ] Screenshot of login page {#deliverable}"
*/
const DELIVERABLE_MARKER = "{#deliverable}";
/**
* Extracts deliverables from BlockNote blocks.
* Looks for checkListItem blocks with {#deliverable} marker in the text.
*
* Example:
* - [ ] Screenshot of login page {#deliverable}
* - [ ] Regular task (not a deliverable)
*
* @param blocks - BlockNote blocks array
* @returns Array of deliverables extracted from marked checkboxes
*/
function extractDeliverables(blocks) {
	const deliverables = [];
	function processBlock(block) {
		const text = extractTextFromBlock(block);
		if (text.includes(DELIVERABLE_MARKER)) {
			const markerRegex = new RegExp(`\\s*${DELIVERABLE_MARKER.replace(/[{}#]/g, "\\$&")}\\s*`, "g");
			const cleanText = text.replace(markerRegex, "").trim();
			deliverables.push({
				id: block.id,
				text: cleanText
			});
		}
		if (block.children && Array.isArray(block.children)) for (const child of block.children) processBlock(child);
	}
	for (const block of blocks) processBlock(block);
	return deliverables;
}
/**
* Extracts plain text from a BlockNote block's content array.
*/
function extractTextFromBlock(block) {
	if (!block.content || !Array.isArray(block.content) || block.content.length === 0) return "";
	return block.content.map((item) => item.text || "").join("").trim();
}

//#endregion
//#region src/github-validation.ts
/**
* Validation schema for GitHub Pull Request API responses.
*
* Ensures GitHub API responses contain required fields before creating LinkedPR objects.
* Prevents runtime errors from malformed or incomplete API responses.
*
* NOTE: This schema ONLY validates fields we actively use for LinkedPR creation.
* GitHub's full PR API response contains 50+ additional fields (created_at, body, user, etc.)
* that we intentionally exclude because we don't need them. This is a validation layer,
* not a complete API mirror.
*
* Validated fields:
* - number: PR number for linking
* - html_url: GitHub URL for display
* - title: PR title for display
* - state: 'open' or 'closed' (for status mapping)
* - draft: Draft status (required by GitHub API, no default needed)
* - merged: Merged status (required by GitHub API, no default needed)
* - head.ref: Branch name
*
* PERFORMANCE NOTE: Validation overhead is ~0.1-0.5ms per Zod parse, which is negligible
* compared to CRDT sync operations (~5-50ms) and network I/O. The safety guarantees
* from runtime validation far outweigh the minimal performance cost.
*
* @see https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request
*/
const GitHubPRResponseSchema = z.object({
	number: z.number(),
	html_url: z.string().url(),
	title: z.string(),
	state: z.enum(["open", "closed"]),
	draft: z.boolean(),
	merged: z.boolean(),
	head: z.object({ ref: z.string() })
});

//#endregion
//#region src/ids.ts
/**
* Creates a PlanId from a string.
* Use this when you know the string is a valid plan ID.
*/
function asPlanId(id) {
	return id;
}
/**
* Creates an AwarenessClientId from a number.
* Use this when you know the number is from awareness.clientID.
*/
function asAwarenessClientId(id) {
	return id;
}
/**
* Creates a WebRTCPeerId from a string.
* Use this when you know the string is from room.peerId.
*/
function asWebRTCPeerId(id) {
	return id;
}
/**
* Creates a GitHubUsername from a string.
* Use this when you know the string is a GitHub username.
*/
function asGitHubUsername(username) {
	return username;
}

//#endregion
//#region src/invite-token.ts
const InviteTokenSchema = z.object({
	id: z.string(),
	tokenHash: z.string(),
	planId: z.string(),
	createdBy: z.string(),
	createdAt: z.number(),
	expiresAt: z.number(),
	maxUses: z.number().nullable(),
	useCount: z.number(),
	revoked: z.boolean(),
	label: z.string().optional()
});
const InviteRedemptionSchema = z.object({
	redeemedBy: z.string(),
	redeemedAt: z.number(),
	tokenId: z.string()
});
/**
* Parse invite token from URL query parameter.
* Format: ?invite={tokenId}:{tokenValue}
*/
function parseInviteFromUrl(url) {
	try {
		const inviteParam = new URL(url).searchParams.get("invite");
		if (!inviteParam) return null;
		const [tokenId, tokenValue] = inviteParam.split(":");
		if (!tokenId || !tokenValue) return null;
		return {
			tokenId,
			tokenValue
		};
	} catch {
		return null;
	}
}
/**
* Build invite URL from plan URL and token.
* baseUrl should include the deployment base path (e.g., https://example.com/shipyard)
*/
function buildInviteUrl(baseUrl, planId, tokenId, tokenValue) {
	const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
	const url = new URL(`${normalizedBase}/task/${planId}`);
	url.searchParams.set("invite", `${tokenId}:${tokenValue}`);
	return url.toString();
}
/**
* Calculate time remaining until token expiration.
*/
function getTokenTimeRemaining(expiresAt) {
	const remaining = expiresAt - Date.now();
	if (remaining <= 0) return {
		expired: true,
		minutes: 0,
		formatted: "Expired"
	};
	const minutes = Math.ceil(remaining / 6e4);
	if (minutes >= 60) {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return {
			expired: false,
			minutes,
			formatted: mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
		};
	}
	return {
		expired: false,
		minutes,
		formatted: `${minutes}m`
	};
}

//#endregion
//#region src/p2p-messages.ts
/**
* P2P Message Protocol for Context Teleportation
*
* This module defines the message types and schemas for peer-to-peer
* conversation transfer over WebRTC data channels.
*
* Message type bytes are chosen to not conflict with Yjs protocol:
* - Yjs uses 0x00-0x04 for its internal messages
* - We use 0xF0-0xF2 for conversation transfer
*
* @see Issue #41 - Context Teleportation
* @see docs/designs/webrtc-custom-messages-research.md
*/
/**
* P2P message type bytes.
* These are carefully chosen to avoid conflicts with Yjs protocol (0x00-0x04).
*/
const P2PMessageType = {
	CONVERSATION_EXPORT_START: 240,
	CONVERSATION_CHUNK: 241,
	CONVERSATION_EXPORT_END: 242
};
/**
* Metadata sent at the start of a conversation export transfer.
* Contains all information needed to reassemble the conversation.
*/
const ConversationExportStartMetaSchema = z.object({
	exportId: z.string(),
	totalChunks: z.number().int().positive(),
	totalBytes: z.number().int().nonnegative(),
	compressedBytes: z.number().int().nonnegative(),
	sourcePlatform: z.string(),
	sourceSessionId: z.string(),
	planId: z.string(),
	exportedAt: z.number().int().positive()
});
/**
* A single chunk of conversation data.
*/
const ChunkMessageSchema = z.object({
	exportId: z.string(),
	chunkIndex: z.number().int().nonnegative(),
	data: z.instanceof(Uint8Array)
});
/**
* End message sent after all chunks, contains checksum for verification.
*/
const ConversationExportEndSchema = z.object({
	exportId: z.string(),
	checksum: z.string()
});
/**
* Checks if a Uint8Array is a P2P conversation export start message.
*/
function isConversationExportStart(data) {
	return data.length > 0 && data[0] === P2PMessageType.CONVERSATION_EXPORT_START;
}
/**
* Checks if a Uint8Array is a P2P conversation chunk message.
*/
function isConversationChunk(data) {
	return data.length > 0 && data[0] === P2PMessageType.CONVERSATION_CHUNK;
}
/**
* Checks if a Uint8Array is a P2P conversation export end message.
*/
function isConversationExportEnd(data) {
	return data.length > 0 && data[0] === P2PMessageType.CONVERSATION_EXPORT_END;
}
/**
* Checks if a Uint8Array is any P2P conversation transfer message.
*/
function isP2PConversationMessage(data) {
	if (data.length === 0) return false;
	const type = data[0];
	return type === P2PMessageType.CONVERSATION_EXPORT_START || type === P2PMessageType.CONVERSATION_CHUNK || type === P2PMessageType.CONVERSATION_EXPORT_END;
}
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
/**
* Encodes a conversation export start message.
* Format: [type byte (1)] [JSON metadata]
*/
function encodeExportStartMessage(meta) {
	const jsonBytes = textEncoder.encode(JSON.stringify(meta));
	const result = new Uint8Array(1 + jsonBytes.length);
	result[0] = P2PMessageType.CONVERSATION_EXPORT_START;
	result.set(jsonBytes, 1);
	return result;
}
/**
* Decodes a conversation export start message.
* @throws {Error} If the message is malformed or validation fails
*/
function decodeExportStartMessage(data) {
	if (data.length === 0 || data[0] !== P2PMessageType.CONVERSATION_EXPORT_START) throw new Error("Invalid export start message: wrong type byte");
	const jsonStr = textDecoder.decode(data.slice(1));
	const parsed = JSON.parse(jsonStr);
	return ConversationExportStartMetaSchema.parse(parsed);
}
/**
* Encodes a chunk message.
* Format: [type byte (1)] [exportId length (4)] [exportId] [chunkIndex (4)] [data]
*/
function encodeChunkMessage(chunk) {
	const exportIdBytes = textEncoder.encode(chunk.exportId);
	const result = new Uint8Array(5 + exportIdBytes.length + 4 + chunk.data.length);
	let offset = 0;
	result[offset] = P2PMessageType.CONVERSATION_CHUNK;
	offset += 1;
	const view = new DataView(result.buffer);
	view.setUint32(offset, exportIdBytes.length, false);
	offset += 4;
	result.set(exportIdBytes, offset);
	offset += exportIdBytes.length;
	view.setUint32(offset, chunk.chunkIndex, false);
	offset += 4;
	result.set(chunk.data, offset);
	return result;
}
/**
* Decodes a chunk message.
* @throws {Error} If the message is malformed
*/
function decodeChunkMessage(data) {
	if (data.length < 9 || data[0] !== P2PMessageType.CONVERSATION_CHUNK) throw new Error("Invalid chunk message: too short or wrong type byte");
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let offset = 1;
	const exportIdLength = view.getUint32(offset, false);
	offset += 4;
	if (data.length < 9 + exportIdLength) throw new Error("Invalid chunk message: exportId extends beyond message");
	const exportId = textDecoder.decode(data.slice(offset, offset + exportIdLength));
	offset += exportIdLength;
	const chunkIndex = view.getUint32(offset, false);
	offset += 4;
	const chunkData = data.slice(offset);
	return ChunkMessageSchema.parse({
		exportId,
		chunkIndex,
		data: chunkData
	});
}
/**
* Encodes a conversation export end message.
* Format: [type byte (1)] [JSON payload]
*/
function encodeExportEndMessage(end) {
	const jsonBytes = textEncoder.encode(JSON.stringify(end));
	const result = new Uint8Array(1 + jsonBytes.length);
	result[0] = P2PMessageType.CONVERSATION_EXPORT_END;
	result.set(jsonBytes, 1);
	return result;
}
/**
* Decodes a conversation export end message.
* @throws {Error} If the message is malformed or validation fails
*/
function decodeExportEndMessage(data) {
	if (data.length === 0 || data[0] !== P2PMessageType.CONVERSATION_EXPORT_END) throw new Error("Invalid export end message: wrong type byte");
	const jsonStr = textDecoder.decode(data.slice(1));
	const parsed = JSON.parse(jsonStr);
	return ConversationExportEndSchema.parse(parsed);
}
/**
* Decodes any P2P conversation message into a discriminated union.
* @throws {Error} If the message is not a valid P2P message
*/
function decodeP2PMessage(data) {
	if (data.length === 0) throw new Error("Cannot decode empty message");
	const type = data[0];
	if (type === void 0) throw new Error("Message type byte is missing");
	switch (type) {
		case P2PMessageType.CONVERSATION_EXPORT_START: return {
			type: "export_start",
			payload: decodeExportStartMessage(data)
		};
		case P2PMessageType.CONVERSATION_CHUNK: return {
			type: "chunk",
			payload: decodeChunkMessage(data)
		};
		case P2PMessageType.CONVERSATION_EXPORT_END: return {
			type: "export_end",
			payload: decodeExportEndMessage(data)
		};
		default: throw new Error(`Unknown P2P message type: 0x${type.toString(16)}`);
	}
}
/**
* Helper to ensure exhaustive handling of decoded messages.
*/
function assertNeverP2PMessage(msg) {
	throw new Error(`Unhandled P2P message type: ${JSON.stringify(msg)}`);
}

//#endregion
//#region src/plan-index.ts
/**
* The document name for the plan index Y.Doc.
* This is a special Y.Doc that tracks all plan metadata for the sidebar.
*/
const PLAN_INDEX_DOC_NAME = "plan-index";
/**
* The key for the viewedBy map within the plan-index Y.Doc.
* Stores per-plan viewedBy data as nested Y.Maps for CRDT merging.
* Structure: Y.Map<planId, Y.Map<username, timestamp>>
*/
const PLAN_INDEX_VIEWED_BY_KEY = "viewedBy";
/**
* Known IndexedDB database names that are NOT plan documents.
* Used to filter when querying for shared plans.
*/
const NON_PLAN_DB_NAMES = ["plan-index", "idb-keyval"];
/**
* Zod schema for validating plan index entries from Y.Map.
* Uses discriminated union on 'deleted' field for better validation performance.
*/
const PlanIndexEntrySchema = z.discriminatedUnion("deleted", [z.object({
	deleted: z.literal(false),
	id: z.string(),
	title: z.string(),
	status: z.enum(PlanStatusValues),
	createdAt: z.number(),
	updatedAt: z.number(),
	ownerId: z.string(),
	tags: z.array(z.string()).optional()
}), z.object({
	deleted: z.literal(true),
	id: z.string(),
	title: z.string(),
	status: z.enum(PlanStatusValues),
	createdAt: z.number(),
	updatedAt: z.number(),
	ownerId: z.string(),
	tags: z.array(z.string()).optional(),
	deletedAt: z.number(),
	deletedBy: z.string()
})]);

//#endregion
//#region src/plan-index-helpers.ts
/**
* Gets all plans from the index Y.Doc, sorted by updatedAt (most recent first).
* By default, filters out archived plans. Pass includeArchived=true to get all plans.
*/
function getPlanIndex(ydoc, includeArchived = false) {
	const plansMap = ydoc.getMap(YDOC_KEYS.PLANS);
	const entries = [];
	for (const [_id, data] of plansMap.entries()) {
		const result = PlanIndexEntrySchema.safeParse(data);
		if (result.success) {
			if (!includeArchived && result.data.deleted) continue;
			entries.push(result.data);
		}
	}
	return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}
/**
* Gets a single plan entry from the index.
*/
function getPlanIndexEntry(ydoc, planId) {
	const data = ydoc.getMap(YDOC_KEYS.PLANS).get(planId);
	if (!data) return null;
	const result = PlanIndexEntrySchema.safeParse(data);
	return result.success ? result.data : null;
}
/**
* Adds or updates a plan in the index.
*/
function setPlanIndexEntry(ydoc, entry) {
	const validated = PlanIndexEntrySchema.parse(entry);
	ydoc.getMap(YDOC_KEYS.PLANS).set(validated.id, validated);
}
/**
* Removes a plan from the index.
*/
function removePlanIndexEntry(ydoc, planId) {
	ydoc.getMap(YDOC_KEYS.PLANS).delete(planId);
}
/**
* Updates only the updatedAt timestamp for a plan in the index.
* Useful when plan content changes but not metadata.
*/
function touchPlanIndexEntry(ydoc, planId) {
	const entry = getPlanIndexEntry(ydoc, planId);
	if (entry) setPlanIndexEntry(ydoc, {
		...entry,
		updatedAt: Date.now()
	});
}
/**
* Gets the viewedBy map for a plan from the plan-index.
* Returns empty object if no viewedBy data exists.
*/
function getViewedByFromIndex(ydoc, planId) {
	const planViewedBy = ydoc.getMap(PLAN_INDEX_VIEWED_BY_KEY).get(planId);
	if (!planViewedBy || !(planViewedBy instanceof Y.Map)) return {};
	const result = {};
	for (const [username, timestamp] of planViewedBy.entries()) if (typeof timestamp === "number") result[username] = timestamp;
	return result;
}
/**
* Updates viewedBy for a plan in the plan-index.
* Uses nested Y.Map for proper CRDT merging of concurrent edits.
*/
function updatePlanIndexViewedBy(ydoc, planId, username) {
	ydoc.transact(() => {
		const viewedByRoot = ydoc.getMap(PLAN_INDEX_VIEWED_BY_KEY);
		let planViewedBy = viewedByRoot.get(planId);
		if (!planViewedBy || !(planViewedBy instanceof Y.Map)) {
			planViewedBy = new Y.Map();
			viewedByRoot.set(planId, planViewedBy);
		}
		planViewedBy.set(username, Date.now());
	});
}
/**
* Clears viewedBy for a plan in the plan-index (marks as unread).
* Removes the user's timestamp, making the plan appear unread again.
*/
function clearPlanIndexViewedBy(ydoc, planId, username) {
	ydoc.transact(() => {
		const planViewedBy = ydoc.getMap(PLAN_INDEX_VIEWED_BY_KEY).get(planId);
		if (planViewedBy && planViewedBy instanceof Y.Map) planViewedBy.delete(username);
	});
}
/**
* Gets all viewedBy data from the plan-index for multiple plans.
* Efficient batch read for inbox calculations.
*/
function getAllViewedByFromIndex(ydoc, planIds) {
	const result = {};
	for (const planId of planIds) result[planId] = getViewedByFromIndex(ydoc, planId);
	return result;
}
/**
* Removes viewedBy data for a plan (call when plan is deleted).
*/
function removeViewedByFromIndex(ydoc, planId) {
	ydoc.getMap(PLAN_INDEX_VIEWED_BY_KEY).delete(planId);
}
/**
* Key for event-level read tracking in plan-index.
* Structure: event-viewedBy[planId][eventId][username] = timestamp
*/
const PLAN_INDEX_EVENT_VIEWED_BY_KEY = "event-viewedBy";
/**
* Mark an event as viewed by a user.
*/
function markEventAsViewed(ydoc, planId, eventId, username) {
	const viewedByRoot = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY);
	let planEvents = viewedByRoot.get(planId);
	if (!planEvents) {
		planEvents = new Y.Map();
		viewedByRoot.set(planId, planEvents);
	}
	let eventViews = planEvents.get(eventId);
	if (!eventViews) {
		eventViews = new Y.Map();
		planEvents.set(eventId, eventViews);
	}
	eventViews.set(username, Date.now());
}
/**
* Clear event viewed status for a user (mark as unread).
*/
function clearEventViewedBy(ydoc, planId, eventId, username) {
	const planEvents = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY).get(planId);
	if (!planEvents) return;
	const eventViews = planEvents.get(eventId);
	if (!eventViews) return;
	eventViews.delete(username);
}
/**
* Check if an event is unread for a user.
*/
function isEventUnread(ydoc, planId, eventId, username) {
	const planEvents = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY).get(planId);
	if (!planEvents) return true;
	const eventViews = planEvents.get(eventId);
	if (!eventViews) return true;
	return !eventViews.has(username);
}
/**
* Get all event viewedBy data for a plan.
* Returns map of eventId -> (username -> timestamp).
*/
function getAllEventViewedByForPlan(ydoc, planId) {
	const planEvents = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY).get(planId);
	if (!planEvents) return {};
	const result = {};
	for (const [eventId, eventViews] of planEvents.entries()) {
		const views = eventViews;
		result[eventId] = Object.fromEntries(views.entries());
	}
	return result;
}

//#endregion
//#region src/routes.ts
/**
* Type-safe API route definitions for registry server.
* Use these instead of hardcoded strings to prevent typos.
*/
const ROUTES = {
	REGISTRY_LIST: "/registry",
	REGISTRY_REGISTER: "/register",
	REGISTRY_UNREGISTER: "/unregister",
	PLAN_STATUS: (planId) => `/api/plan/${planId}/status`,
	PLAN_HAS_CONNECTIONS: (planId) => `/api/plan/${planId}/has-connections`,
	PLAN_TRANSCRIPT: (planId) => `/api/plan/${planId}/transcript`,
	PLAN_SUBSCRIBE: (planId) => `/api/plan/${planId}/subscribe`,
	PLAN_CHANGES: (planId) => `/api/plan/${planId}/changes`,
	PLAN_UNSUBSCRIBE: (planId) => `/api/plan/${planId}/unsubscribe`,
	PLAN_PR_DIFF: (planId, prNumber) => `/api/plans/${planId}/pr-diff/${prNumber}`,
	PLAN_PR_FILES: (planId, prNumber) => `/api/plans/${planId}/pr-files/${prNumber}`,
	HOOK_SESSION: "/api/hook/session",
	HOOK_CONTENT: (planId) => `/api/hook/plan/${planId}/content`,
	HOOK_REVIEW: (planId) => `/api/hook/plan/${planId}/review`,
	HOOK_SESSION_TOKEN: (planId) => `/api/hook/plan/${planId}/session-token`,
	HOOK_PRESENCE: (planId) => `/api/hook/plan/${planId}/presence`,
	CONVERSATION_IMPORT: "/api/conversation/import"
};

//#endregion
//#region src/thread-formatter.ts
/**
* Format comment threads for LLM consumption.
* Returns clean, readable feedback text.
*/
function formatThreadsForLLM(threads, options = {}) {
	const { includeResolved = false, selectedTextMaxLength = 100, resolveUser } = options;
	const unresolvedThreads = threads.filter((t$1) => !t$1.resolved);
	const resolvedCount = threads.length - unresolvedThreads.length;
	const threadsToShow = includeResolved ? threads : unresolvedThreads;
	if (threadsToShow.length === 0) {
		if (resolvedCount > 0) return `All ${resolvedCount} comment(s) have been resolved.`;
		return "";
	}
	let output = threadsToShow.map((thread, index) => {
		const location = thread.selectedText ? `On: "${truncate(thread.selectedText, selectedTextMaxLength)}"` : `Comment ${index + 1}`;
		const comments = thread.comments.map((c, idx) => {
			const text = extractTextFromCommentBody(c.body);
			const author = resolveUser ? resolveUser(c.userId) : c.userId.slice(0, 8);
			if (idx === 0) return `${author}: ${text}`;
			return `${author} (reply): ${text}`;
		}).join("\n");
		return `${location}${thread.resolved ? " [Resolved]" : ""}\n${comments}`;
	}).join("\n\n");
	if (!includeResolved && resolvedCount > 0) output += `\n\n---\n(${resolvedCount} resolved comment(s) not shown)`;
	return output;
}
function truncate(text, maxLength) {
	const cleaned = text.replace(/\n/g, " ").trim();
	if (cleaned.length <= maxLength) return cleaned;
	return `${cleaned.slice(0, maxLength)}...`;
}

//#endregion
//#region src/trpc/schemas.ts
/**
* Additional Zod schemas for tRPC procedures.
* Re-exports existing schemas and adds new ones needed for tRPC.
*/
const PlanIdSchema = z.object({ planId: z.string().min(1) });
const PlanStatusResponseSchema = z.object({ status: z.string() });
const HasConnectionsResponseSchema = z.object({ hasConnections: z.boolean() });
const SubscriptionClientIdSchema = z.object({
	planId: z.string().min(1),
	clientId: z.string().min(1)
});
const ChangeTypeSchema = z.enum([
	"status",
	"comments",
	"resolved",
	"content",
	"artifacts"
]);
const ChangeSchema = z.object({
	type: ChangeTypeSchema,
	timestamp: z.number(),
	summary: z.string(),
	details: z.record(z.string(), z.unknown()).optional()
});
const ChangesResponseSchema = z.discriminatedUnion("ready", [z.object({
	ready: z.literal(true),
	changes: z.string(),
	details: z.array(ChangeSchema)
}), z.object({
	ready: z.literal(false),
	pending: z.number(),
	windowExpiresIn: z.number()
})]);
const DeleteSubscriptionResponseSchema = z.object({ success: z.boolean() });
const SetSessionTokenRequestSchema = z.object({ sessionTokenHash: z.string().min(1) });
const GetDeliverableContextRequestSchema = z.object({ sessionToken: z.string().min(1) });
const GetDeliverableContextResponseSchema = z.object({ context: z.string() });
const SetSessionTokenResponseSchema = z.object({ url: z.string() });
const ImportConversationRequestSchema = z.object({
	a2aMessages: z.array(A2AMessageSchema),
	meta: z.object({
		planId: z.string().optional(),
		sourcePlatform: z.string().optional(),
		sessionId: z.string().optional()
	}).optional()
});
const ImportConversationResponseSchema = z.discriminatedUnion("success", [z.object({
	success: z.literal(true),
	sessionId: z.string(),
	transcriptPath: z.string(),
	messageCount: z.number()
}), z.object({
	success: z.literal(false),
	error: z.string()
})]);

//#endregion
//#region src/trpc/trpc.ts
/**
* tRPC initialization for shipyard.
* Provides the base router and procedure builders.
*/
const t = initTRPC.context().create({ allowOutsideOfServer: true });
const router = t.router;
const publicProcedure = t.procedure;
const middleware = t.middleware;

//#endregion
//#region src/trpc/routers/conversation.ts
/**
* Conversation router - handles conversation import from A2A protocol.
*
* Handler logic is injected via context since it requires filesystem access
* and Claude Code specific paths that only the server package knows.
*/
const conversationRouter = router({ import: publicProcedure.input(ImportConversationRequestSchema).output(ImportConversationResponseSchema).mutation(async ({ input, ctx }) => {
	return ctx.conversationHandlers.importConversation(input, ctx);
}) });

//#endregion
//#region src/trpc/routers/hook.ts
const hookRouter = router({
	createSession: publicProcedure.input(CreateHookSessionRequestSchema).output(CreateHookSessionResponseSchema).mutation(async ({ input, ctx }) => {
		return ctx.hookHandlers.createSession(input, ctx);
	}),
	updateContent: publicProcedure.input(PlanIdSchema.merge(UpdatePlanContentRequestSchema)).output(UpdatePlanContentResponseSchema).mutation(async ({ input, ctx }) => {
		const { planId, ...contentInput } = input;
		return ctx.hookHandlers.updateContent(planId, contentInput, ctx);
	}),
	getReviewStatus: publicProcedure.input(PlanIdSchema).output(GetReviewStatusResponseSchema).query(async ({ input, ctx }) => {
		return ctx.hookHandlers.getReviewStatus(input.planId, ctx);
	}),
	updatePresence: publicProcedure.input(PlanIdSchema.merge(UpdatePresenceRequestSchema)).output(UpdatePresenceResponseSchema).mutation(async ({ input, ctx }) => {
		const { planId, ...presenceInput } = input;
		return ctx.hookHandlers.updatePresence(planId, presenceInput, ctx);
	}),
	setSessionToken: publicProcedure.input(PlanIdSchema.merge(SetSessionTokenRequestSchema)).output(SetSessionTokenResponseSchema).mutation(async ({ input, ctx }) => {
		const { planId, sessionTokenHash } = input;
		return ctx.hookHandlers.setSessionToken(planId, sessionTokenHash, ctx);
	}),
	waitForApproval: publicProcedure.input(z.object({
		planId: z.string(),
		reviewRequestId: z.string()
	})).output(z.object({
		approved: z.boolean(),
		feedback: z.string().optional(),
		deliverables: z.array(z.any()).optional(),
		reviewComment: z.string().optional(),
		reviewedBy: z.string().optional(),
		status: z.string().optional()
	})).mutation(async ({ input, ctx }) => {
		const { planId, reviewRequestId } = input;
		return ctx.hookHandlers.waitForApproval(planId, reviewRequestId, ctx);
	}),
	getDeliverableContext: publicProcedure.input(PlanIdSchema.merge(GetDeliverableContextRequestSchema)).output(GetDeliverableContextResponseSchema).query(async ({ input, ctx }) => {
		const { planId, sessionToken } = input;
		return ctx.hookHandlers.getDeliverableContext(planId, sessionToken, ctx);
	}),
	getSessionContext: publicProcedure.input(z.object({ sessionId: z.string() })).output(z.discriminatedUnion("found", [z.object({
		found: z.literal(true),
		planId: z.string(),
		sessionToken: z.string(),
		url: z.string(),
		deliverables: z.array(z.object({
			id: z.string(),
			text: z.string()
		})),
		reviewComment: z.string().optional(),
		reviewedBy: z.string().optional(),
		reviewStatus: z.string().optional()
	}), z.object({ found: z.literal(false) })])).query(async ({ input, ctx }) => {
		return ctx.hookHandlers.getSessionContext(input.sessionId, ctx);
	})
});

//#endregion
//#region src/trpc/routers/plan.ts
/**
* tRPC router for plan status and connection queries.
*/
/**
* Plan router - queries plan status and connection state.
*/
const planRouter = router({
	getStatus: publicProcedure.input(PlanIdSchema).output(PlanStatusResponseSchema).query(async ({ input, ctx }) => {
		const metadata = getPlanMetadata(await ctx.getOrCreateDoc(input.planId));
		if (!metadata) throw new TRPCError({
			code: "NOT_FOUND",
			message: "Plan not found"
		});
		return { status: metadata.status };
	}),
	hasConnections: publicProcedure.input(PlanIdSchema).output(HasConnectionsResponseSchema).query(async ({ input, ctx }) => {
		return { hasConnections: await ctx.getPlanStore().hasActiveConnections(input.planId) };
	})
});

//#endregion
//#region src/trpc/routers/subscription.ts
/**
* tRPC router for plan change subscriptions.
* Allows clients to subscribe to and poll for changes to a plan.
*/
/**
* Subscription router - manages change notification subscriptions.
*/
const subscriptionRouter = router({
	create: publicProcedure.input(PlanIdSchema.merge(CreateSubscriptionRequestSchema)).output(CreateSubscriptionResponseSchema).mutation(async ({ input, ctx }) => {
		const { planId, subscribe, windowMs, maxWindowMs, threshold } = input;
		return { clientId: ctx.getPlanStore().createSubscription({
			planId,
			subscribe: subscribe || ["status"],
			windowMs: windowMs ?? 5e3,
			maxWindowMs: maxWindowMs ?? 3e4,
			threshold: threshold ?? 1
		}) };
	}),
	getChanges: publicProcedure.input(SubscriptionClientIdSchema).output(ChangesResponseSchema).query(async ({ input, ctx }) => {
		const { planId, clientId } = input;
		const result = ctx.getPlanStore().getChanges(planId, clientId);
		if (!result) throw new TRPCError({
			code: "NOT_FOUND",
			message: "Subscription not found"
		});
		return result;
	}),
	delete: publicProcedure.input(SubscriptionClientIdSchema).output(DeleteSubscriptionResponseSchema).mutation(async ({ input, ctx }) => {
		const { planId, clientId } = input;
		return { success: ctx.getPlanStore().deleteSubscription(planId, clientId) };
	})
});

//#endregion
//#region src/trpc/index.ts
/**
* tRPC router exports for shipyard.
*
* This module provides:
* - Combined app router with all sub-routers
* - Type exports for client type inference
* - Context type for server implementation
*/
const appRouter = router({
	hook: hookRouter,
	plan: planRouter,
	subscription: subscriptionRouter,
	conversation: conversationRouter
});

//#endregion
//#region src/user-helpers.ts
/**
* Create a user resolver function bound to a specific Y.Doc.
* Useful when resolving multiple users in a loop.
*
* @param ydoc - Y.Doc containing the users map
* @param fallbackLength - Length of userId to use as fallback (default: 8)
* @returns Function that resolves user IDs to display names
*/
function createUserResolver(ydoc, fallbackLength = 8) {
	const usersMap = ydoc.getMap("users");
	return (userId) => {
		return usersMap.get(userId)?.displayName ?? userId.slice(0, fallbackLength);
	};
}

//#endregion
export { A2ADataPartSchema, A2AFilePartSchema, A2AMessageSchema, A2APartSchema, A2ATextPartSchema, AgentActivityDataSchema, AgentActivityTypes, AgentPresenceSchema, ArtifactSchema, ChangeSchema, ChangeTypeSchema, ChangesResponseSchema, ChunkMessageSchema, ClaudeCodeMessageSchema, ClaudeCodeOriginMetadataSchema, ConversationExportEndSchema, ConversationExportMetaSchema, ConversationExportStartMetaSchema, ConversationVersionSchema, CreateHookSessionRequestSchema, CreateHookSessionResponseSchema, CreateSubscriptionRequestSchema, CreateSubscriptionResponseSchema, CursorOriginMetadataSchema, DeleteSubscriptionResponseSchema, DeliverableSchema, DevinOriginMetadataSchema, GetReviewStatusResponseSchema, GitHubPRResponseSchema, HasConnectionsResponseSchema, HookApiErrorSchema, ImportConversationRequestSchema, ImportConversationResponseSchema, InputRequestSchema, InputRequestStatusValues, InputRequestTypeValues, InviteRedemptionSchema, InviteTokenSchema, LinkedPRSchema, LinkedPRStatusValues, NON_PLAN_DB_NAMES, OriginMetadataSchema, OriginPlatformValues, P2PMessageType, PLAN_INDEX_DOC_NAME, PLAN_INDEX_EVENT_VIEWED_BY_KEY, PLAN_INDEX_VIEWED_BY_KEY, PRReviewCommentSchema, PlanEventSchema, PlanEventTypes, PlanIdSchema, PlanIndexEntrySchema, PlanMetadataSchema, PlanSnapshotSchema, PlanStatusResponseSchema, PlanStatusValues, PlanViewTabValues, ROUTES, RegisterServerRequestSchema, RegisterServerResponseSchema, ReviewCommentSchema, ReviewFeedbackSchema, SetSessionTokenRequestSchema, SetSessionTokenResponseSchema, SubscriptionClientIdSchema, ThreadCommentSchema, ThreadSchema, UnregisterServerRequestSchema, UnregisterServerResponseSchema, UpdatePlanContentRequestSchema, UpdatePlanContentResponseSchema, UpdatePresenceRequestSchema, UpdatePresenceResponseSchema, VALID_STATUS_TRANSITIONS, YDOC_KEYS, a2aToClaudeCode, addArtifact, addConversationVersion, addDeliverable, addPRReviewComment, addPlanTag, addSnapshot, answerInputRequest, appRouter, approveUser, archivePlan, asAwarenessClientId, asGitHubUsername, asPlanId, asWebRTCPeerId, assertNever, assertNeverP2PMessage, buildInviteUrl, cancelInputRequest, claudeCodeToA2A, clearAgentPresence, clearEventViewedBy, clearPlanIndexViewedBy, conversationRouter, createGitHubArtifact, createHandedOffConversationVersion, createInitialConversationVersion, createInputRequest, createLinkedPR, createLocalArtifact, createPlanSnapshot, createPlanUrl, createPlanUrlWithHistory, createUserResolver, decodeChunkMessage, decodeExportEndMessage, decodeExportStartMessage, decodeP2PMessage, decodePlan, encodeChunkMessage, encodeExportEndMessage, encodeExportStartMessage, encodePlan, extractDeliverables, extractMentions, extractTextFromCommentBody, formatAsClaudeCodeJSONL, formatDeliverablesForLLM, formatThreadsForLLM, getAgentPresence, getAgentPresences, getAllEventViewedByForPlan, getAllTagsFromIndex, getAllViewedByFromIndex, getApprovedUsers, getArtifactUrl, getArtifacts, getConversationVersions, getDeliverables, getLatestSnapshot, getLinkedPR, getLinkedPRs, getPRReviewComments, getPRReviewCommentsForPR, getPlanEvents, getPlanFromUrl, getPlanIndex, getPlanIndexEntry, getPlanMetadata, getPlanMetadataWithValidation, getPlanOwnerId, getRejectedUsers, getSnapshots, getStepCompletions, getTokenTimeRemaining, getViewedBy, getViewedByFromIndex, hookRouter, initPlanMetadata, isApprovalRequired, isConversationChunk, isConversationExportEnd, isConversationExportStart, isEventUnread, isInboxWorthy, isP2PConversationMessage, isPlanUnread, isStepCompleted, isThread, isUrlEncodedPlanV1, isUrlEncodedPlanV2, isUserApproved, isUserRejected, isValidYDocKey, linkArtifactToDeliverable, linkPR, logPlanEvent, markEventAsViewed, markPlanAsViewed, markVersionHandedOff, parseClaudeCodeOrigin, parseClaudeCodeTranscriptString, parseInviteFromUrl, parseThreads, planRouter, rejectUser, removeArtifact, removePRReviewComment, removePlanIndexEntry, removePlanTag, removeViewedByFromIndex, resolvePRReviewComment, revokeUser, setAgentPresence, setPlanIndexEntry, setPlanMetadata, subscriptionRouter, summarizeA2AConversation, toggleStepCompletion, touchPlanIndexEntry, transitionPlanStatus, unarchivePlan, unlinkPR, unrejectUser, updateLinkedPRStatus, updatePlanIndexViewedBy, validateA2AMessages };
//# sourceMappingURL=index.mjs.map