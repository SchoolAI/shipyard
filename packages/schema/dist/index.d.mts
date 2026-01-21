import { AgentActivityData, AgentActivityDataSchema, AgentActivityType, AgentActivityTypes, Artifact, ArtifactSchema, ArtifactType, ClaudeCodeOriginMetadata, ClaudeCodeOriginMetadataSchema, ConversationVersion, ConversationVersionSchema, CursorOriginMetadata, CursorOriginMetadataSchema, Deliverable, DeliverableSchema, DevinOriginMetadata, DevinOriginMetadataSchema, GitHubArtifact, LinkedPR, LinkedPRSchema, LinkedPRStatus, LinkedPRStatusValues, LocalArtifact, OriginMetadata, OriginMetadataSchema, OriginPlatform, OriginPlatformValues, PRReviewComment, PRReviewCommentSchema, PlanEvent, PlanEventSchema, PlanEventType, PlanEventTypes, PlanMetadata, PlanMetadataSchema, PlanSnapshot, PlanSnapshotSchema, PlanStatusType, PlanStatusValues, PlanViewTab, PlanViewTabValues, StepCompletion, createGitHubArtifact, createHandedOffConversationVersion, createInitialConversationVersion, createLinkedPR, createLocalArtifact, getArtifactUrl, isInboxWorthy, parseClaudeCodeOrigin } from "./plan.mjs";
import { $ as markPlanAsViewed, A as getDeliverables, At as RegisterServerRequestSchema, B as getRejectedUsers, Bt as UnregisterServerResponseSchema, C as createPlanSnapshot, Ct as CreateSubscriptionResponse, D as getApprovedUsers, Dt as HookApiError, E as getAllTagsFromIndex, Et as GetReviewStatusResponseSchema, F as getPRReviewCommentsForPR, Ft as ReviewFeedback, G as isApprovalRequired, Gt as UpdatePresenceRequest, H as getStepCompletions, Ht as UpdatePlanContentRequestSchema, I as getPlanEvents, It as ReviewFeedbackSchema, J as isUserApproved, Jt as UpdatePresenceResponseSchema, K as isPlanUnread, Kt as UpdatePresenceRequestSchema, L as getPlanMetadata, Lt as UnregisterServerRequest, M as getLinkedPR, Mt as RegisterServerResponseSchema, N as getLinkedPRs, Nt as ReviewComment, O as getArtifacts, Ot as HookApiErrorSchema, P as getPRReviewComments, Pt as ReviewCommentSchema, Q as logPlanEvent, R as getPlanMetadataWithValidation, Rt as UnregisterServerRequestSchema, S as clearAgentPresence, St as CreateSubscriptionRequestSchema, T as getAgentPresences, Tt as GetReviewStatusResponse, U as getViewedBy, Ut as UpdatePlanContentResponse, V as getSnapshots, Vt as UpdatePlanContentRequest, W as initPlanMetadata, Wt as UpdatePlanContentResponseSchema, X as linkArtifactToDeliverable, Y as isUserRejected, Z as linkPR, _ as addSnapshot, _t as CreateHookSessionRequest, a as StatusTransition, at as resolvePRReviewComment, b as archivePlan, bt as CreateHookSessionResponseSchema, c as TransitionToCompleted, ct as setPlanMetadata, d as VALID_STATUS_TRANSITIONS, dt as unarchivePlan, et as markVersionHandedOff, f as addArtifact, ft as unlinkPR, g as addPlanTag, gt as AgentPresenceSchema, h as addPRReviewComment, ht as AgentPresence, i as PlanMetadataBaseUpdate, it as removePlanTag, j as getLatestSnapshot, jt as RegisterServerResponse, k as getConversationVersions, kt as RegisterServerRequest, l as TransitionToInProgress, lt as toggleStepCompletion, m as addDeliverable, mt as updateLinkedPRStatus, n as GetPlanMetadataResult, nt as removeArtifact, o as TransitionResult, ot as revokeUser, p as addConversationVersion, pt as unrejectUser, q as isStepCompleted, qt as UpdatePresenceResponse, r as InitPlanMetadataParams, rt as removePRReviewComment, s as TransitionToChangesRequested, st as setAgentPresence, t as ArchiveResult, tt as rejectUser, u as TransitionToPendingReview, ut as transitionPlanStatus, v as answerInputRequest, vt as CreateHookSessionRequestSchema, w as getAgentPresence, wt as CreateSubscriptionResponseSchema, x as cancelInputRequest, xt as CreateSubscriptionRequest, y as approveUser, yt as CreateHookSessionResponse, z as getPlanOwnerId, zt as UnregisterServerResponse } from "./yjs-helpers-CZnJfYVg.mjs";
import { UrlEncodedPlan, UrlEncodedPlanV1, UrlEncodedPlanV2, UrlKeyVersion, UrlSnapshotRef, createPlanUrl, createPlanUrlWithHistory, decodePlan, encodePlan, getPlanFromUrl, isUrlEncodedPlanV1, isUrlEncodedPlanV2 } from "./url-encoding.mjs";
import { z } from "zod";
import * as Y from "yjs";
import * as _trpc_server28 from "@trpc/server";

//#region src/assert-never.d.ts

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
declare function assertNever(value: never): never;
//#endregion
//#region src/conversation-export.d.ts

/**
 * A2A Text Part - plain text content
 */
declare const A2ATextPartSchema: z.ZodObject<{
  type: z.ZodLiteral<"text">;
  text: z.ZodString;
}, z.core.$strip>;
type A2ATextPart = z.infer<typeof A2ATextPartSchema>;
/**
 * A2A Data Part - structured data (JSON)
 * Used for tool calls, results, and other structured content
 */
declare const A2ADataPartSchema: z.ZodObject<{
  type: z.ZodLiteral<"data">;
  data: z.ZodUnknown;
}, z.core.$strip>;
type A2ADataPart = z.infer<typeof A2ADataPartSchema>;
/**
 * A2A File Part - file reference
 * Used for file attachments, images, etc.
 */
declare const A2AFilePartSchema: z.ZodObject<{
  type: z.ZodLiteral<"file">;
  uri: z.ZodString;
  mediaType: z.ZodOptional<z.ZodString>;
  name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type A2AFilePart = z.infer<typeof A2AFilePartSchema>;
/**
 * A2A Part schema - validates any of the three part types
 * Uses a custom approach to avoid Zod v4 issues with union arrays
 */
declare const A2APartSchema: z.ZodObject<{
  type: z.ZodEnum<{
    file: "file";
    data: "data";
    text: "text";
  }>;
}, z.core.$loose>;
type A2APart = A2ATextPart | A2ADataPart | A2AFilePart;
/**
 * A2A Message schema - validates the full message structure.
 * Uses a custom schema to work around Zod v4 issues with complex union arrays.
 */
declare const A2AMessageSchema: z.ZodPipe<z.ZodObject<{
  messageId: z.ZodString;
  role: z.ZodEnum<{
    user: "user";
    agent: "agent";
  }>;
  contextId: z.ZodOptional<z.ZodString>;
  taskId: z.ZodOptional<z.ZodString>;
  referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  extensions: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$loose>, z.ZodTransform<{
  parts: A2APart[];
  messageId: string;
  role: "user" | "agent";
  contextId?: string | undefined;
  taskId?: string | undefined;
  referenceTaskIds?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  extensions?: string[] | undefined;
}, {
  [x: string]: unknown;
  messageId: string;
  role: "user" | "agent";
  contextId?: string | undefined;
  taskId?: string | undefined;
  referenceTaskIds?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  extensions?: string[] | undefined;
}>>;
type A2AMessage = {
  messageId: string;
  role: 'user' | 'agent';
  parts: A2APart[];
  contextId?: string;
  taskId?: string;
  referenceTaskIds?: string[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
};
/**
 * Metadata about a conversation export
 */
declare const ConversationExportMetaSchema: z.ZodObject<{
  exportId: z.ZodString;
  sourcePlatform: z.ZodString;
  sourceSessionId: z.ZodString;
  planId: z.ZodString;
  exportedAt: z.ZodNumber;
  messageCount: z.ZodNumber;
  compressedBytes: z.ZodNumber;
  uncompressedBytes: z.ZodNumber;
}, z.core.$strip>;
type ConversationExportMeta = z.infer<typeof ConversationExportMetaSchema>;
/**
 * Claude Code JSONL message schema
 * This is the full structure of each line in the session.jsonl file
 */
declare const ClaudeCodeMessageSchema: z.ZodObject<{
  sessionId: z.ZodString;
  type: z.ZodEnum<{
    user: "user";
    assistant: "assistant";
    summary: "summary";
  }>;
  message: z.ZodObject<{
    role: z.ZodString;
    content: z.ZodArray<z.ZodObject<{
      type: z.ZodEnum<{
        text: "text";
        tool_use: "tool_use";
        tool_result: "tool_result";
      }>;
    }, z.core.$loose>>;
    id: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    usage: z.ZodOptional<z.ZodObject<{
      input_tokens: z.ZodNumber;
      output_tokens: z.ZodNumber;
      cache_creation_input_tokens: z.ZodOptional<z.ZodNumber>;
      cache_read_input_tokens: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
  }, z.core.$strip>;
  uuid: z.ZodString;
  timestamp: z.ZodString;
  parentUuid: z.ZodOptional<z.ZodString>;
  costUSD: z.ZodOptional<z.ZodNumber>;
  durationMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type ClaudeCodeMessage = z.infer<typeof ClaudeCodeMessageSchema>;
/**
 * Result of parsing a transcript - includes both successful and failed parses
 */
interface ParseTranscriptResult {
  messages: ClaudeCodeMessage[];
  errors: Array<{
    line: number;
    error: string;
  }>;
}
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
declare function parseClaudeCodeTranscriptString(content: string): ParseTranscriptResult;
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
declare function claudeCodeToA2A(messages: ClaudeCodeMessage[], contextId: string): A2AMessage[];
/**
 * Validates an array of A2A messages.
 * Useful for validating imported conversations.
 *
 * @param messages - Array of potential A2A messages
 * @returns Validation result with valid messages and errors
 */
declare function validateA2AMessages(messages: unknown[]): {
  valid: A2AMessage[];
  errors: Array<{
    index: number;
    error: string;
  }>;
};
/**
 * Extracts a brief summary from A2A messages for display purposes.
 * Useful when creating a plan from imported conversation.
 *
 * @param messages - Array of A2A messages
 * @param maxMessages - Maximum number of messages to include in summary (default: 3)
 * @returns Object with title (first user message) and text (summary of exchange)
 */
declare function summarizeA2AConversation(messages: A2AMessage[], maxMessages?: number): {
  title: string;
  text: string;
};
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
declare function a2aToClaudeCode(messages: A2AMessage[], sessionId?: string): ClaudeCodeMessage[];
/**
 * Formats an array of Claude Code messages as JSONL string.
 *
 * Claude Code session files are JSONL (JSON Lines) format where each
 * line is a complete JSON object representing one message.
 *
 * @param messages - Array of Claude Code messages
 * @returns JSONL formatted string
 */
declare function formatAsClaudeCodeJSONL(messages: ClaudeCodeMessage[]): string;
//#endregion
//#region src/deliverable-formatter.d.ts
/**
 * Format deliverables list for LLM consumption.
 * Matches the format used in read_plan tool.
 */
declare function formatDeliverablesForLLM(deliverables: Deliverable[]): string;
//#endregion
//#region src/deliverable-parser.d.ts
/**
 * BlockNote block structure (simplified).
 * We only care about checkListItem blocks with {#deliverable} marker.
 * This is a minimal interface that matches BlockNote's actual Block type.
 */
interface Block {
  id: string;
  type: string;
  content?: Array<{
    type: string;
    text: string;
    styles?: Record<string, unknown>;
  }> | unknown;
  children?: Block[] | unknown;
}
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
declare function extractDeliverables(blocks: Block[]): Deliverable[];
//#endregion
//#region src/github-validation.d.ts
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
declare const GitHubPRResponseSchema: z.ZodObject<{
  number: z.ZodNumber;
  html_url: z.ZodString;
  title: z.ZodString;
  state: z.ZodEnum<{
    open: "open";
    closed: "closed";
  }>;
  draft: z.ZodBoolean;
  merged: z.ZodBoolean;
  head: z.ZodObject<{
    ref: z.ZodString;
  }, z.core.$strip>;
}, z.core.$strip>;
type GitHubPRResponse = z.infer<typeof GitHubPRResponseSchema>;
//#endregion
//#region src/ids.d.ts
/**
 * Branded type aliases for ID systems.
 *
 * These types use TypeScript's branded types pattern to prevent
 * accidental misuse of IDs across different systems.
 *
 * @see docs/ID-SYSTEMS-INVENTORY.md for complete documentation
 */
/**
 * Yjs awareness client ID.
 * A 32-bit integer assigned by Yjs when a Y.Doc is created.
 * Used for document synchronization and tracking connected clients.
 *
 * NOT the same as WebRTCPeerId!
 */
type AwarenessClientId = number & {
  readonly __brand: 'AwarenessClientId';
};
/**
 * y-webrtc peer ID.
 * A UUID v4 string generated by y-webrtc for each room participant.
 * Used as the key in room.webrtcConns Map.
 *
 * NOT the same as AwarenessClientId!
 */
type WebRTCPeerId = string & {
  readonly __brand: 'WebRTCPeerId';
};
/**
 * Plan ID.
 * A nanoid (21 character) string generated when a plan is created.
 * Used in URLs, Y.Doc document names, and IndexedDB keys.
 */
type PlanId = string & {
  readonly __brand: 'PlanId';
};
/**
 * GitHub username.
 * Used for user identity, plan ownership, and approval system.
 */
type GitHubUsername = string & {
  readonly __brand: 'GitHubUsername';
};
/**
 * Session token.
 * A nanoid string used for authenticating MCP API requests.
 * The hash of this token is stored in the Y.Doc.
 */
type SessionToken = string & {
  readonly __brand: 'SessionToken';
};
/**
 * Review request ID.
 * A nanoid string generated when a review is requested.
 * Used to prevent stale review decisions.
 */
type ReviewRequestId = string & {
  readonly __brand: 'ReviewRequestId';
};
/**
 * Export ID.
 * A UUID string generated for P2P conversation transfers.
 * Used to track multi-chunk transfers.
 */
type ExportId = string & {
  readonly __brand: 'ExportId';
};
/**
 * Creates a PlanId from a string.
 * Use this when you know the string is a valid plan ID.
 */
declare function asPlanId(id: string): PlanId;
/**
 * Creates an AwarenessClientId from a number.
 * Use this when you know the number is from awareness.clientID.
 */
declare function asAwarenessClientId(id: number): AwarenessClientId;
/**
 * Creates a WebRTCPeerId from a string.
 * Use this when you know the string is from room.peerId.
 */
declare function asWebRTCPeerId(id: string): WebRTCPeerId;
/**
 * Creates a GitHubUsername from a string.
 * Use this when you know the string is a GitHub username.
 */
declare function asGitHubUsername(username: string): GitHubUsername;
//#endregion
//#region src/input-request.d.ts
/**
 * Valid input request types.
 * - text: Single-line text input
 * - multiline: Multi-line text input
 * - choice: Select from predefined options
 * - confirm: Boolean yes/no question
 */
declare const InputRequestTypeValues: readonly ["text", "multiline", "choice", "confirm"];
type InputRequestType = (typeof InputRequestTypeValues)[number];
/**
 * Valid status values for an input request.
 * - pending: Awaiting user response
 * - answered: User has responded
 * - declined: User explicitly declined to answer
 * - cancelled: Request cancelled (timeout)
 */
declare const InputRequestStatusValues: readonly ["pending", "answered", "declined", "cancelled"];
type InputRequestStatus = (typeof InputRequestStatusValues)[number];
/** Text input request - single line text entry */
declare const TextInputSchema: z.ZodObject<{
  id: z.ZodString;
  createdAt: z.ZodNumber;
  message: z.ZodString;
  status: z.ZodEnum<{
    pending: "pending";
    answered: "answered";
    declined: "declined";
    cancelled: "cancelled";
  }>;
  defaultValue: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
  planId: z.ZodOptional<z.ZodString>;
  response: z.ZodOptional<z.ZodUnknown>;
  answeredAt: z.ZodOptional<z.ZodNumber>;
  answeredBy: z.ZodOptional<z.ZodString>;
  type: z.ZodLiteral<"text">;
}, z.core.$strip>;
/** Multiline input request - multi-line text entry */
declare const MultilineInputSchema: z.ZodObject<{
  id: z.ZodString;
  createdAt: z.ZodNumber;
  message: z.ZodString;
  status: z.ZodEnum<{
    pending: "pending";
    answered: "answered";
    declined: "declined";
    cancelled: "cancelled";
  }>;
  defaultValue: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
  planId: z.ZodOptional<z.ZodString>;
  response: z.ZodOptional<z.ZodUnknown>;
  answeredAt: z.ZodOptional<z.ZodNumber>;
  answeredBy: z.ZodOptional<z.ZodString>;
  type: z.ZodLiteral<"multiline">;
}, z.core.$strip>;
/** Choice input request - select from predefined options */
declare const ChoiceInputSchema: z.ZodObject<{
  id: z.ZodString;
  createdAt: z.ZodNumber;
  message: z.ZodString;
  status: z.ZodEnum<{
    pending: "pending";
    answered: "answered";
    declined: "declined";
    cancelled: "cancelled";
  }>;
  defaultValue: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
  planId: z.ZodOptional<z.ZodString>;
  response: z.ZodOptional<z.ZodUnknown>;
  answeredAt: z.ZodOptional<z.ZodNumber>;
  answeredBy: z.ZodOptional<z.ZodString>;
  type: z.ZodLiteral<"choice">;
  options: z.ZodArray<z.ZodString>;
  multiSelect: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/** Confirm input request - boolean yes/no question */
declare const ConfirmInputSchema: z.ZodObject<{
  id: z.ZodString;
  createdAt: z.ZodNumber;
  message: z.ZodString;
  status: z.ZodEnum<{
    pending: "pending";
    answered: "answered";
    declined: "declined";
    cancelled: "cancelled";
  }>;
  defaultValue: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
  planId: z.ZodOptional<z.ZodString>;
  response: z.ZodOptional<z.ZodUnknown>;
  answeredAt: z.ZodOptional<z.ZodNumber>;
  answeredBy: z.ZodOptional<z.ZodString>;
  type: z.ZodLiteral<"confirm">;
}, z.core.$strip>;
/**
 * Schema for an input request stored in Y.Doc.
 * Uses discriminated union on 'type' field to ensure:
 * - 'choice' type REQUIRES options array
 * - Other types don't have options
 *
 * Follows CRDT patterns from existing Shipyard schemas.
 */
declare const InputRequestSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  id: z.ZodString;
  createdAt: z.ZodNumber;
  message: z.ZodString;
  status: z.ZodEnum<{
    pending: "pending";
    answered: "answered";
    declined: "declined";
    cancelled: "cancelled";
  }>;
  defaultValue: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
  planId: z.ZodOptional<z.ZodString>;
  response: z.ZodOptional<z.ZodUnknown>;
  answeredAt: z.ZodOptional<z.ZodNumber>;
  answeredBy: z.ZodOptional<z.ZodString>;
  type: z.ZodLiteral<"text">;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  createdAt: z.ZodNumber;
  message: z.ZodString;
  status: z.ZodEnum<{
    pending: "pending";
    answered: "answered";
    declined: "declined";
    cancelled: "cancelled";
  }>;
  defaultValue: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
  planId: z.ZodOptional<z.ZodString>;
  response: z.ZodOptional<z.ZodUnknown>;
  answeredAt: z.ZodOptional<z.ZodNumber>;
  answeredBy: z.ZodOptional<z.ZodString>;
  type: z.ZodLiteral<"multiline">;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  createdAt: z.ZodNumber;
  message: z.ZodString;
  status: z.ZodEnum<{
    pending: "pending";
    answered: "answered";
    declined: "declined";
    cancelled: "cancelled";
  }>;
  defaultValue: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
  planId: z.ZodOptional<z.ZodString>;
  response: z.ZodOptional<z.ZodUnknown>;
  answeredAt: z.ZodOptional<z.ZodNumber>;
  answeredBy: z.ZodOptional<z.ZodString>;
  type: z.ZodLiteral<"choice">;
  options: z.ZodArray<z.ZodString>;
  multiSelect: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  createdAt: z.ZodNumber;
  message: z.ZodString;
  status: z.ZodEnum<{
    pending: "pending";
    answered: "answered";
    declined: "declined";
    cancelled: "cancelled";
  }>;
  defaultValue: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
  planId: z.ZodOptional<z.ZodString>;
  response: z.ZodOptional<z.ZodUnknown>;
  answeredAt: z.ZodOptional<z.ZodNumber>;
  answeredBy: z.ZodOptional<z.ZodString>;
  type: z.ZodLiteral<"confirm">;
}, z.core.$strip>], "type">;
type InputRequest = z.infer<typeof InputRequestSchema>;
type TextInputRequest = z.infer<typeof TextInputSchema>;
type MultilineInputRequest = z.infer<typeof MultilineInputSchema>;
type ChoiceInputRequest = z.infer<typeof ChoiceInputSchema>;
type ConfirmInputRequest = z.infer<typeof ConfirmInputSchema>;
/** Base params for creating any input request */
interface CreateInputRequestBaseParams {
  message: string;
  defaultValue?: string;
  timeout?: number;
  planId?: string;
}
/** Params for creating a text input request */
interface CreateTextInputParams extends CreateInputRequestBaseParams {
  type: 'text';
}
/** Params for creating a multiline input request */
interface CreateMultilineInputParams extends CreateInputRequestBaseParams {
  type: 'multiline';
}
/** Params for creating a choice input request */
interface CreateChoiceInputParams extends CreateInputRequestBaseParams {
  type: 'choice';
  /** Required: available options for selection */
  options: string[];
  /** Enable multi-select (uses checkboxes instead of radio buttons) */
  multiSelect?: boolean;
}
/** Params for creating a confirm input request */
interface CreateConfirmInputParams extends CreateInputRequestBaseParams {
  type: 'confirm';
}
/**
 * Parameters for creating a new input request.
 * Discriminated union ensures 'choice' type requires options.
 */
type CreateInputRequestParams = CreateTextInputParams | CreateMultilineInputParams | CreateChoiceInputParams | CreateConfirmInputParams;
/**
 * Create a new input request with auto-generated fields.
 * Sets id, createdAt, and status to initial values.
 *
 * @param params - Request parameters (discriminated by type)
 * @returns Complete InputRequest ready to store in Y.Doc
 */
declare function createInputRequest(params: CreateInputRequestParams): InputRequest;
//#endregion
//#region src/invite-token.d.ts
/**
 * Invite token for time-limited P2P room access.
 * Stored server-side only (not in CRDT) to prevent client manipulation.
 */
interface InviteToken {
  /** Token ID (8 chars) - used for URL lookup */
  id: string;
  /** SHA256 hash of the actual token value - never store raw token */
  tokenHash: string;
  /** Plan ID this token is for */
  planId: string;
  /** GitHub username of creator (plan owner) */
  createdBy: string;
  /** Unix timestamp when created */
  createdAt: number;
  /** Unix timestamp when token expires */
  expiresAt: number;
  /** Max number of times token can be used (null = unlimited) */
  maxUses: number | null;
  /** Current number of times token has been used */
  useCount: number;
  /** Whether token has been manually revoked */
  revoked: boolean;
  /** Optional label for the invite (e.g., "Team review", "PR #42") */
  label?: string;
}
declare const InviteTokenSchema: z.ZodObject<{
  id: z.ZodString;
  tokenHash: z.ZodString;
  planId: z.ZodString;
  createdBy: z.ZodString;
  createdAt: z.ZodNumber;
  expiresAt: z.ZodNumber;
  maxUses: z.ZodNullable<z.ZodNumber>;
  useCount: z.ZodNumber;
  revoked: z.ZodBoolean;
  label: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * Record of who redeemed an invite token.
 */
interface InviteRedemption {
  /** User who redeemed */
  redeemedBy: string;
  /** When redeemed */
  redeemedAt: number;
  /** Token ID that was redeemed */
  tokenId: string;
}
declare const InviteRedemptionSchema: z.ZodObject<{
  redeemedBy: z.ZodString;
  redeemedAt: z.ZodNumber;
  tokenId: z.ZodString;
}, z.core.$strip>;
/**
 * Request to create a new invite token (owner only).
 */
interface CreateInviteRequest {
  type: 'create_invite';
  planId: string;
  /** TTL in minutes (default: 30) */
  ttlMinutes?: number;
  /** Max uses (null = unlimited, default: null) */
  maxUses?: number | null;
  /** Optional label */
  label?: string;
}
/**
 * Response with created invite token.
 * tokenValue is only sent once - store it immediately!
 */
interface InviteCreatedResponse {
  type: 'invite_created';
  tokenId: string;
  /** The actual token value - only sent once on creation! */
  tokenValue: string;
  expiresAt: number;
  maxUses: number | null;
  label?: string;
}
/**
 * Request to redeem an invite token (guest).
 */
interface RedeemInviteRequest {
  type: 'redeem_invite';
  planId: string;
  tokenId: string;
  tokenValue: string;
  userId: string;
}
/**
 * Response to invite redemption attempt.
 */
type InviteRedemptionResult = {
  type: 'invite_redemption_result';
  success: true;
  planId: string;
} | {
  type: 'invite_redemption_result';
  success: false;
  error: 'expired' | 'exhausted' | 'revoked' | 'invalid' | 'already_redeemed';
};
/**
 * Request to revoke an invite token (owner only).
 */
interface RevokeInviteRequest {
  type: 'revoke_invite';
  planId: string;
  tokenId: string;
}
/**
 * Response to invite revocation.
 */
interface InviteRevokedResponse {
  type: 'invite_revoked';
  tokenId: string;
  success: boolean;
}
/**
 * Request to list active invites (owner only).
 */
interface ListInvitesRequest {
  type: 'list_invites';
  planId: string;
}
/**
 * Response with active invites list.
 */
interface InvitesListResponse {
  type: 'invites_list';
  planId: string;
  invites: Array<{
    tokenId: string;
    label?: string;
    expiresAt: number;
    maxUses: number | null;
    useCount: number;
    createdAt: number;
  }>;
}
/**
 * Notification to owner when someone redeems an invite.
 */
interface InviteRedeemedNotification {
  type: 'invite_redeemed';
  planId: string;
  tokenId: string;
  label?: string;
  redeemedBy: string;
  useCount: number;
  maxUses: number | null;
}
type InviteSignalingMessage = CreateInviteRequest | RedeemInviteRequest | RevokeInviteRequest | ListInvitesRequest;
type InviteSignalingResponse = InviteCreatedResponse | InviteRedemptionResult | InviteRevokedResponse | InvitesListResponse | InviteRedeemedNotification;
/**
 * Parse invite token from URL query parameter.
 * Format: ?invite={tokenId}:{tokenValue}
 */
declare function parseInviteFromUrl(url: string): {
  tokenId: string;
  tokenValue: string;
} | null;
/**
 * Build invite URL from plan URL and token.
 * baseUrl should include the deployment base path (e.g., https://example.com/shipyard)
 */
declare function buildInviteUrl(baseUrl: string, planId: string, tokenId: string, tokenValue: string): string;
/**
 * Calculate time remaining until token expiration.
 */
declare function getTokenTimeRemaining(expiresAt: number): {
  expired: boolean;
  minutes: number;
  formatted: string;
};
//#endregion
//#region src/p2p-messages.d.ts
/**
 * P2P message type bytes.
 * These are carefully chosen to avoid conflicts with Yjs protocol (0x00-0x04).
 */
declare const P2PMessageType: {
  readonly CONVERSATION_EXPORT_START: 240;
  readonly CONVERSATION_CHUNK: 241;
  readonly CONVERSATION_EXPORT_END: 242;
};
type P2PMessageTypeValue = (typeof P2PMessageType)[keyof typeof P2PMessageType];
/**
 * Metadata sent at the start of a conversation export transfer.
 * Contains all information needed to reassemble the conversation.
 */
declare const ConversationExportStartMetaSchema: z.ZodObject<{
  exportId: z.ZodString;
  totalChunks: z.ZodNumber;
  totalBytes: z.ZodNumber;
  compressedBytes: z.ZodNumber;
  sourcePlatform: z.ZodString;
  sourceSessionId: z.ZodString;
  planId: z.ZodString;
  exportedAt: z.ZodNumber;
}, z.core.$strip>;
type ConversationExportStartMeta = z.infer<typeof ConversationExportStartMetaSchema>;
/**
 * A single chunk of conversation data.
 */
declare const ChunkMessageSchema: z.ZodObject<{
  exportId: z.ZodString;
  chunkIndex: z.ZodNumber;
  data: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
}, z.core.$strip>;
type ChunkMessage = z.infer<typeof ChunkMessageSchema>;
/**
 * End message sent after all chunks, contains checksum for verification.
 */
declare const ConversationExportEndSchema: z.ZodObject<{
  exportId: z.ZodString;
  checksum: z.ZodString;
}, z.core.$strip>;
type ConversationExportEnd = z.infer<typeof ConversationExportEndSchema>;
/**
 * Checks if a Uint8Array is a P2P conversation export start message.
 */
declare function isConversationExportStart(data: Uint8Array): boolean;
/**
 * Checks if a Uint8Array is a P2P conversation chunk message.
 */
declare function isConversationChunk(data: Uint8Array): boolean;
/**
 * Checks if a Uint8Array is a P2P conversation export end message.
 */
declare function isConversationExportEnd(data: Uint8Array): boolean;
/**
 * Checks if a Uint8Array is any P2P conversation transfer message.
 */
declare function isP2PConversationMessage(data: Uint8Array): boolean;
/**
 * Encodes a conversation export start message.
 * Format: [type byte (1)] [JSON metadata]
 */
declare function encodeExportStartMessage(meta: ConversationExportStartMeta): Uint8Array;
/**
 * Decodes a conversation export start message.
 * @throws {Error} If the message is malformed or validation fails
 */
declare function decodeExportStartMessage(data: Uint8Array): ConversationExportStartMeta;
/**
 * Encodes a chunk message.
 * Format: [type byte (1)] [exportId length (4)] [exportId] [chunkIndex (4)] [data]
 */
declare function encodeChunkMessage(chunk: ChunkMessage): Uint8Array;
/**
 * Decodes a chunk message.
 * @throws {Error} If the message is malformed
 */
declare function decodeChunkMessage(data: Uint8Array): ChunkMessage;
/**
 * Encodes a conversation export end message.
 * Format: [type byte (1)] [JSON payload]
 */
declare function encodeExportEndMessage(end: ConversationExportEnd): Uint8Array;
/**
 * Decodes a conversation export end message.
 * @throws {Error} If the message is malformed or validation fails
 */
declare function decodeExportEndMessage(data: Uint8Array): ConversationExportEnd;
/**
 * Decoded P2P message with discriminated union type.
 */
type DecodedP2PMessage = {
  type: 'export_start';
  payload: ConversationExportStartMeta;
} | {
  type: 'chunk';
  payload: ChunkMessage;
} | {
  type: 'export_end';
  payload: ConversationExportEnd;
};
/**
 * Decodes any P2P conversation message into a discriminated union.
 * @throws {Error} If the message is not a valid P2P message
 */
declare function decodeP2PMessage(data: Uint8Array): DecodedP2PMessage;
/**
 * Helper to ensure exhaustive handling of decoded messages.
 */
declare function assertNeverP2PMessage(msg: never): never;
//#endregion
//#region src/plan-index.d.ts
/**
 * The document name for the plan index Y.Doc.
 * This is a special Y.Doc that tracks all plan metadata for the sidebar.
 */
declare const PLAN_INDEX_DOC_NAME = "plan-index";
/**
 * The key for the viewedBy map within the plan-index Y.Doc.
 * Stores per-plan viewedBy data as nested Y.Maps for CRDT merging.
 * Structure: Y.Map<planId, Y.Map<username, timestamp>>
 */
declare const PLAN_INDEX_VIEWED_BY_KEY = "viewedBy";
/**
 * Known IndexedDB database names that are NOT plan documents.
 * Used to filter when querying for shared plans.
 */
declare const NON_PLAN_DB_NAMES: readonly ["plan-index", "idb-keyval"];
/**
 * Base fields shared by all plan index entries.
 */
interface PlanIndexEntryBase {
  id: string;
  title: string;
  status: PlanStatusType;
  createdAt: number;
  updatedAt: number;
  /** GitHub username of the plan owner */
  ownerId: string;
  /** Tags for categorization (copied from plan metadata for fast filtering) */
  tags?: string[];
}
/**
 * Plan summary for the index (minimal data for sidebar display).
 * Uses a discriminated union to ensure deletedAt and deletedBy always appear together.
 */
type PlanIndexEntry = (PlanIndexEntryBase & {
  deleted: false;
}) | (PlanIndexEntryBase & {
  deleted: true;
  /** Timestamp when plan was archived/deleted (hidden from sidebar by default) */
  deletedAt: number;
  /** Display name of who archived/deleted the plan */
  deletedBy: string;
});
/**
 * Zod schema for validating plan index entries from Y.Map.
 * Uses discriminated union on 'deleted' field for better validation performance.
 */
declare const PlanIndexEntrySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  deleted: z.ZodLiteral<false>;
  id: z.ZodString;
  title: z.ZodString;
  status: z.ZodEnum<{
    draft: "draft";
    pending_review: "pending_review";
    changes_requested: "changes_requested";
    in_progress: "in_progress";
    completed: "completed";
  }>;
  createdAt: z.ZodNumber;
  updatedAt: z.ZodNumber;
  ownerId: z.ZodString;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>, z.ZodObject<{
  deleted: z.ZodLiteral<true>;
  id: z.ZodString;
  title: z.ZodString;
  status: z.ZodEnum<{
    draft: "draft";
    pending_review: "pending_review";
    changes_requested: "changes_requested";
    in_progress: "in_progress";
    completed: "completed";
  }>;
  createdAt: z.ZodNumber;
  updatedAt: z.ZodNumber;
  ownerId: z.ZodString;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  deletedAt: z.ZodNumber;
  deletedBy: z.ZodString;
}, z.core.$strip>], "deleted">;
//#endregion
//#region src/plan-index-helpers.d.ts
/**
 * Gets all plans from the index Y.Doc, sorted by updatedAt (most recent first).
 * By default, filters out archived plans. Pass includeArchived=true to get all plans.
 */
declare function getPlanIndex(ydoc: Y.Doc, includeArchived?: boolean): PlanIndexEntry[];
/**
 * Gets a single plan entry from the index.
 */
declare function getPlanIndexEntry(ydoc: Y.Doc, planId: string): PlanIndexEntry | null;
/**
 * Adds or updates a plan in the index.
 */
declare function setPlanIndexEntry(ydoc: Y.Doc, entry: PlanIndexEntry): void;
/**
 * Removes a plan from the index.
 */
declare function removePlanIndexEntry(ydoc: Y.Doc, planId: string): void;
/**
 * Updates only the updatedAt timestamp for a plan in the index.
 * Useful when plan content changes but not metadata.
 */
declare function touchPlanIndexEntry(ydoc: Y.Doc, planId: string): void;
/**
 * Gets the viewedBy map for a plan from the plan-index.
 * Returns empty object if no viewedBy data exists.
 */
declare function getViewedByFromIndex(ydoc: Y.Doc, planId: string): Record<string, number>;
/**
 * Updates viewedBy for a plan in the plan-index.
 * Uses nested Y.Map for proper CRDT merging of concurrent edits.
 */
declare function updatePlanIndexViewedBy(ydoc: Y.Doc, planId: string, username: string): void;
/**
 * Clears viewedBy for a plan in the plan-index (marks as unread).
 * Removes the user's timestamp, making the plan appear unread again.
 */
declare function clearPlanIndexViewedBy(ydoc: Y.Doc, planId: string, username: string): void;
/**
 * Gets all viewedBy data from the plan-index for multiple plans.
 * Efficient batch read for inbox calculations.
 */
declare function getAllViewedByFromIndex(ydoc: Y.Doc, planIds: string[]): Record<string, Record<string, number>>;
/**
 * Removes viewedBy data for a plan (call when plan is deleted).
 */
declare function removeViewedByFromIndex(ydoc: Y.Doc, planId: string): void;
/**
 * Key for event-level read tracking in plan-index.
 * Structure: event-viewedBy[planId][eventId][username] = timestamp
 */
declare const PLAN_INDEX_EVENT_VIEWED_BY_KEY: "event-viewedBy";
/**
 * Mark an event as viewed by a user.
 */
declare function markEventAsViewed(ydoc: Y.Doc, planId: string, eventId: string, username: string): void;
/**
 * Clear event viewed status for a user (mark as unread).
 */
declare function clearEventViewedBy(ydoc: Y.Doc, planId: string, eventId: string, username: string): void;
/**
 * Check if an event is unread for a user.
 */
declare function isEventUnread(ydoc: Y.Doc, planId: string, eventId: string, username: string): boolean;
/**
 * Get all event viewedBy data for a plan.
 * Returns map of eventId -> (username -> timestamp).
 */
declare function getAllEventViewedByForPlan(ydoc: Y.Doc, planId: string): Record<string, Record<string, number>>;
//#endregion
//#region src/routes.d.ts
/**
 * Type-safe API route definitions for registry server.
 * Use these instead of hardcoded strings to prevent typos.
 */
declare const ROUTES: {
  readonly REGISTRY_LIST: "/registry";
  readonly REGISTRY_REGISTER: "/register";
  readonly REGISTRY_UNREGISTER: "/unregister";
  readonly PLAN_STATUS: (planId: string) => string;
  readonly PLAN_HAS_CONNECTIONS: (planId: string) => string;
  readonly PLAN_TRANSCRIPT: (planId: string) => string;
  readonly PLAN_SUBSCRIBE: (planId: string) => string;
  readonly PLAN_CHANGES: (planId: string) => string;
  readonly PLAN_UNSUBSCRIBE: (planId: string) => string;
  readonly PLAN_PR_DIFF: (planId: string, prNumber: number) => string;
  readonly PLAN_PR_FILES: (planId: string, prNumber: number) => string;
  readonly HOOK_SESSION: "/api/hook/session";
  readonly HOOK_CONTENT: (planId: string) => string;
  readonly HOOK_REVIEW: (planId: string) => string;
  readonly HOOK_SESSION_TOKEN: (planId: string) => string;
  readonly HOOK_PRESENCE: (planId: string) => string;
  readonly CONVERSATION_IMPORT: "/api/conversation/import";
};
type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
//#endregion
//#region src/thread.d.ts
/**
 * Zod schema for comment body - can be a string or structured content.
 * BlockNote stores comment bodies as arrays of block content.
 */
declare const CommentBodySchema: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
/**
 * BlockNote comment content - can be a string or structured content.
 * Schema is source of truth - type derived via z.infer.
 */
type CommentBody = z.infer<typeof CommentBodySchema>;
/**
 * Zod schema for thread comment validation.
 */
declare const ThreadCommentSchema: z.ZodObject<{
  id: z.ZodString;
  userId: z.ZodString;
  body: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
  createdAt: z.ZodNumber;
}, z.core.$strip>;
/**
 * Individual comment within a thread.
 * Schema is source of truth - type derived via z.infer.
 */
type ThreadComment = z.infer<typeof ThreadCommentSchema>;
/**
 * Zod schema for thread validation.
 */
declare const ThreadSchema: z.ZodObject<{
  id: z.ZodString;
  comments: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    body: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
    createdAt: z.ZodNumber;
  }, z.core.$strip>>;
  resolved: z.ZodOptional<z.ZodBoolean>;
  selectedText: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * Comment thread on a plan block.
 * Schema is source of truth - type derived via z.infer.
 */
type Thread = z.infer<typeof ThreadSchema>;
/**
 * Type guard for checking if a value is a valid Thread.
 */
declare function isThread(value: unknown): value is Thread;
/**
 * Safely parse threads from Y.Map data.
 * Returns only valid threads, silently dropping invalid ones.
 */
declare function parseThreads(data: Record<string, unknown>): Thread[];
/**
 * Extract plain text from BlockNote comment body.
 * Handles both string and structured block content.
 */
declare function extractTextFromCommentBody(body: CommentBody): string;
/**
 * Extract @mentions from comment body.
 * Looks for patterns like @username in the text.
 *
 * @param body - Comment body (string or structured content)
 * @returns Array of mentioned GitHub usernames (without @ prefix)
 */
declare function extractMentions(body: CommentBody): string[];
//#endregion
//#region src/thread-formatter.d.ts
interface FormatThreadsOptions {
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
declare function formatThreadsForLLM(threads: Thread[], options?: FormatThreadsOptions): string;
//#endregion
//#region src/trpc/routers/conversation.d.ts
/**
 * Conversation router - handles conversation import from A2A protocol.
 *
 * Handler logic is injected via context since it requires filesystem access
 * and Claude Code specific paths that only the server package knows.
 */
declare const conversationRouter: _trpc_server28.TRPCBuiltRouter<{
  ctx: Context;
  meta: object;
  errorShape: _trpc_server28.TRPCDefaultErrorShape;
  transformer: false;
}, _trpc_server28.TRPCDecorateCreateRouterOptions<{
  /**
   * Import a conversation from A2A format into a Claude Code session.
   * POST /api/conversation/import
   */
  import: _trpc_server28.TRPCMutationProcedure<{
    input: {
      a2aMessages: {
        [x: string]: unknown;
        messageId: string;
        role: "user" | "agent";
        contextId?: string | undefined;
        taskId?: string | undefined;
        referenceTaskIds?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
        extensions?: string[] | undefined;
      }[];
      meta?: {
        planId?: string | undefined;
        sourcePlatform?: string | undefined;
        sessionId?: string | undefined;
      } | undefined;
    };
    output: {
      success: true;
      sessionId: string;
      transcriptPath: string;
      messageCount: number;
    } | {
      success: false;
      error: string;
    };
    meta: object;
  }>;
}>>;
/**
 * Minimal context interface required by conversation handlers.
 * This avoids circular dependencies with the full Context type.
 */
interface ConversationContext {
  logger: Logger;
}
/**
 * Handler interface for conversation operations.
 * Implemented by server package to provide actual business logic.
 */
interface ConversationHandlers {
  importConversation: (input: {
    a2aMessages: unknown[];
    meta?: {
      planId?: string;
      sourcePlatform?: string;
      sessionId?: string;
    };
  }, ctx: ConversationContext) => Promise<{
    success: true;
    sessionId: string;
    transcriptPath: string;
    messageCount: number;
  } | {
    success: false;
    error: string;
  }>;
}
//#endregion
//#region src/trpc/schemas.d.ts
declare const PlanIdSchema: z.ZodObject<{
  planId: z.ZodString;
}, z.core.$strip>;
type PlanIdInput = z.infer<typeof PlanIdSchema>;
declare const PlanStatusResponseSchema: z.ZodObject<{
  status: z.ZodString;
}, z.core.$strip>;
type PlanStatusResponse = z.infer<typeof PlanStatusResponseSchema>;
declare const HasConnectionsResponseSchema: z.ZodObject<{
  hasConnections: z.ZodBoolean;
}, z.core.$strip>;
type HasConnectionsResponse = z.infer<typeof HasConnectionsResponseSchema>;
declare const SubscriptionClientIdSchema: z.ZodObject<{
  planId: z.ZodString;
  clientId: z.ZodString;
}, z.core.$strip>;
type SubscriptionClientIdInput = z.infer<typeof SubscriptionClientIdSchema>;
declare const ChangeTypeSchema: z.ZodEnum<{
  status: "status";
  content: "content";
  artifacts: "artifacts";
  resolved: "resolved";
  comments: "comments";
}>;
type ChangeType = z.infer<typeof ChangeTypeSchema>;
declare const ChangeSchema: z.ZodObject<{
  type: z.ZodEnum<{
    status: "status";
    content: "content";
    artifacts: "artifacts";
    resolved: "resolved";
    comments: "comments";
  }>;
  timestamp: z.ZodNumber;
  summary: z.ZodString;
  details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
type Change = z.infer<typeof ChangeSchema>;
declare const ChangesResponseSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  ready: z.ZodLiteral<true>;
  changes: z.ZodString;
  details: z.ZodArray<z.ZodObject<{
    type: z.ZodEnum<{
      status: "status";
      content: "content";
      artifacts: "artifacts";
      resolved: "resolved";
      comments: "comments";
    }>;
    timestamp: z.ZodNumber;
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
  ready: z.ZodLiteral<false>;
  pending: z.ZodNumber;
  windowExpiresIn: z.ZodNumber;
}, z.core.$strip>], "ready">;
type ChangesResponse = z.infer<typeof ChangesResponseSchema>;
declare const DeleteSubscriptionResponseSchema: z.ZodObject<{
  success: z.ZodBoolean;
}, z.core.$strip>;
type DeleteSubscriptionResponse = z.infer<typeof DeleteSubscriptionResponseSchema>;
interface SubscriptionCreateParams {
  planId: string;
  subscribe: ChangeType[];
  windowMs: number;
  maxWindowMs: number;
  threshold: number;
}
declare const SetSessionTokenRequestSchema: z.ZodObject<{
  sessionTokenHash: z.ZodString;
}, z.core.$strip>;
type SetSessionTokenRequest = z.infer<typeof SetSessionTokenRequestSchema>;
declare const GetDeliverableContextResponseSchema: z.ZodObject<{
  context: z.ZodString;
}, z.core.$strip>;
declare const SetSessionTokenResponseSchema: z.ZodObject<{
  url: z.ZodString;
}, z.core.$strip>;
type SetSessionTokenResponse = z.infer<typeof SetSessionTokenResponseSchema>;
declare const ImportConversationRequestSchema: z.ZodObject<{
  a2aMessages: z.ZodArray<z.ZodPipe<z.ZodObject<{
    messageId: z.ZodString;
    role: z.ZodEnum<{
      user: "user";
      agent: "agent";
    }>;
    contextId: z.ZodOptional<z.ZodString>;
    taskId: z.ZodOptional<z.ZodString>;
    referenceTaskIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    extensions: z.ZodOptional<z.ZodArray<z.ZodString>>;
  }, z.core.$loose>, z.ZodTransform<{
    parts: A2APart[];
    messageId: string;
    role: "user" | "agent";
    contextId?: string | undefined;
    taskId?: string | undefined;
    referenceTaskIds?: string[] | undefined;
    metadata?: Record<string, unknown> | undefined;
    extensions?: string[] | undefined;
  }, {
    [x: string]: unknown;
    messageId: string;
    role: "user" | "agent";
    contextId?: string | undefined;
    taskId?: string | undefined;
    referenceTaskIds?: string[] | undefined;
    metadata?: Record<string, unknown> | undefined;
    extensions?: string[] | undefined;
  }>>>;
  meta: z.ZodOptional<z.ZodObject<{
    planId: z.ZodOptional<z.ZodString>;
    sourcePlatform: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type ImportConversationRequest = z.infer<typeof ImportConversationRequestSchema>;
declare const ImportConversationResponseSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  success: z.ZodLiteral<true>;
  sessionId: z.ZodString;
  transcriptPath: z.ZodString;
  messageCount: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
  success: z.ZodLiteral<false>;
  error: z.ZodString;
}, z.core.$strip>], "success">;
type ImportConversationResponse = z.infer<typeof ImportConversationResponseSchema>;
//#endregion
//#region src/trpc/routers/hook.d.ts
/**
 * Hook router - manages plan sessions from Claude Code hook.
 *
 * Handler logic is injected via context to keep this router package-agnostic.
 * The actual business logic lives in the server package's hook-handlers.ts.
 */
type ApprovalResult = {
  approved: true;
  deliverables: unknown[];
  reviewComment?: string;
  reviewedBy: string;
  status: 'in_progress';
} | {
  approved: false;
  feedback: string;
  status: 'changes_requested' | 'timeout';
  reviewComment?: string;
  reviewedBy?: string;
};
type SessionContextResult = {
  found: true;
  planId: string;
  sessionToken: string;
  url: string;
  deliverables: Array<{
    id: string;
    text: string;
  }>;
  reviewComment?: string;
  reviewedBy?: string;
  reviewStatus?: string;
} | {
  found: false;
};
declare const hookRouter: _trpc_server28.TRPCBuiltRouter<{
  ctx: Context;
  meta: object;
  errorShape: _trpc_server28.TRPCDefaultErrorShape;
  transformer: false;
}, _trpc_server28.TRPCDecorateCreateRouterOptions<{
  /**
   * Create a new plan session.
   * POST /api/hook/session
   */
  createSession: _trpc_server28.TRPCMutationProcedure<{
    input: {
      sessionId: string;
      agentType?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
    };
    output: {
      planId: string;
      url: string;
    };
    meta: object;
  }>;
  /**
   * Update plan content with markdown.
   * PUT /api/hook/plan/:id/content
   */
  updateContent: _trpc_server28.TRPCMutationProcedure<{
    input: {
      planId: string;
      content: string;
      filePath?: string | undefined;
    };
    output: {
      success: boolean;
      updatedAt: number;
    };
    meta: object;
  }>;
  /**
   * Get review status for a plan.
   * GET /api/hook/plan/:id/review
   */
  getReviewStatus: _trpc_server28.TRPCQueryProcedure<{
    input: {
      planId: string;
    };
    output: {
      status: "draft";
    } | {
      status: "pending_review";
      reviewRequestId: string;
    } | {
      status: "changes_requested";
      reviewedAt: number;
      reviewedBy: string;
      reviewComment?: string | undefined;
      feedback?: {
        threadId: string;
        comments: {
          author: string;
          content: string;
          createdAt: number;
        }[];
        blockId?: string | undefined;
      }[] | undefined;
    } | {
      status: "in_progress";
      reviewedAt: number;
      reviewedBy: string;
    } | {
      status: "completed";
      completedAt: number;
      completedBy: string;
      snapshotUrl?: string | undefined;
    };
    meta: object;
  }>;
  /**
   * Update agent presence in a plan.
   * POST /api/hook/plan/:id/presence
   */
  updatePresence: _trpc_server28.TRPCMutationProcedure<{
    input: {
      planId: string;
      agentType: string;
      sessionId: string;
    };
    output: {
      success: boolean;
    };
    meta: object;
  }>;
  /**
   * Set session token for a plan.
   * POST /api/hook/plan/:id/session-token
   */
  setSessionToken: _trpc_server28.TRPCMutationProcedure<{
    input: {
      planId: string;
      sessionTokenHash: string;
    };
    output: {
      url: string;
    };
    meta: object;
  }>;
  /**
   * Wait for approval decision (blocking).
   * Called by hook to wait for browser approval/rejection.
   * POST /api/hook/plan/:id/wait-approval
   */
  waitForApproval: _trpc_server28.TRPCMutationProcedure<{
    input: {
      planId: string;
      reviewRequestId: string;
    };
    output: {
      approved: boolean;
      feedback?: string | undefined;
      deliverables?: any[] | undefined;
      reviewComment?: string | undefined;
      reviewedBy?: string | undefined;
      status?: string | undefined;
    };
    meta: object;
  }>;
  /**
   * Get formatted deliverable context for post-exit injection.
   * Returns pre-formatted context string for Claude Code.
   * GET /api/hook/plan/:id/deliverable-context
   */
  getDeliverableContext: _trpc_server28.TRPCQueryProcedure<{
    input: {
      planId: string;
      sessionToken: string;
    };
    output: {
      context: string;
    };
    meta: object;
  }>;
  /**
   * Get session context (for post-exit injection).
   * Returns session data and deletes it from server registry.
   * GET /api/hook/session/:sessionId/context
   */
  getSessionContext: _trpc_server28.TRPCQueryProcedure<{
    input: {
      sessionId: string;
    };
    output: {
      found: true;
      planId: string;
      sessionToken: string;
      url: string;
      deliverables: {
        id: string;
        text: string;
      }[];
      reviewComment?: string | undefined;
      reviewedBy?: string | undefined;
      reviewStatus?: string | undefined;
    } | {
      found: false;
    };
    meta: object;
  }>;
}>>;
/**
 * Minimal context interface required by hook handlers.
 * This avoids circular dependencies with the full Context type.
 */
interface HookContext {
  getOrCreateDoc: (planId: string) => Promise<Y.Doc>;
  logger: Logger;
}
/**
 * Handler interface for hook operations.
 * Implemented by server package to provide actual business logic.
 */
interface HookHandlers {
  createSession: (input: z.infer<typeof CreateHookSessionRequestSchema>, ctx: HookContext) => Promise<z.infer<typeof CreateHookSessionResponseSchema>>;
  updateContent: (planId: string, input: z.infer<typeof UpdatePlanContentRequestSchema>, ctx: HookContext) => Promise<z.infer<typeof UpdatePlanContentResponseSchema>>;
  getReviewStatus: (planId: string, ctx: HookContext) => Promise<z.infer<typeof GetReviewStatusResponseSchema>>;
  updatePresence: (planId: string, input: z.infer<typeof UpdatePresenceRequestSchema>, ctx: HookContext) => Promise<z.infer<typeof UpdatePresenceResponseSchema>>;
  setSessionToken: (planId: string, sessionTokenHash: string, ctx: HookContext) => Promise<z.infer<typeof SetSessionTokenResponseSchema>>;
  waitForApproval: (planId: string, reviewRequestId: string, ctx: HookContext) => Promise<ApprovalResult>;
  getDeliverableContext: (planId: string, sessionToken: string, ctx: HookContext) => Promise<z.infer<typeof GetDeliverableContextResponseSchema>>;
  getSessionContext: (sessionId: string, ctx: HookContext) => Promise<SessionContextResult>;
}
//#endregion
//#region src/trpc/context.d.ts
/**
 * Logger interface for dependency injection.
 * Compatible with pino logger but allows other implementations.
 */
interface Logger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
  debug: (obj: object, msg?: string) => void;
}
/**
 * Plan store interface for subscription management.
 */
interface PlanStore {
  createSubscription: (params: SubscriptionCreateParams) => string;
  getChanges: (planId: string, clientId: string) => ChangesResponse | null;
  deleteSubscription: (planId: string, clientId: string) => boolean;
  hasActiveConnections: (planId: string) => Promise<boolean>;
}
/**
 * tRPC context provided to all procedures.
 * Dependencies are injected by the server's context factory.
 */
interface Context {
  /** Get or create a Y.Doc by plan ID */
  getOrCreateDoc: (planId: string) => Promise<Y.Doc>;
  /** Get the plan store for subscription management */
  getPlanStore: () => PlanStore;
  /** Logger instance */
  logger: Logger;
  /** Hook API handlers */
  hookHandlers: HookHandlers;
  /** Conversation import/export handlers */
  conversationHandlers: ConversationHandlers;
}
/**
 * Context factory function type.
 * The server implements this to create context for each request.
 */
type CreateContextFn = () => Context | Promise<Context>;
//#endregion
//#region src/trpc/routers/plan.d.ts
/**
 * tRPC router for plan status and connection queries.
 */
/**
 * Plan router - queries plan status and connection state.
 */
declare const planRouter: _trpc_server28.TRPCBuiltRouter<{
  ctx: Context;
  meta: object;
  errorShape: _trpc_server28.TRPCDefaultErrorShape;
  transformer: false;
}, _trpc_server28.TRPCDecorateCreateRouterOptions<{
  /**
   * Get the current status of a plan.
   * GET /api/plan/:id/status
   */
  getStatus: _trpc_server28.TRPCQueryProcedure<{
    input: {
      planId: string;
    };
    output: {
      status: string;
    };
    meta: object;
  }>;
  /**
   * Check if a plan has any active WebSocket connections.
   * Used to avoid opening duplicate browser tabs.
   * GET /api/plan/:id/has-connections
   */
  hasConnections: _trpc_server28.TRPCQueryProcedure<{
    input: {
      planId: string;
    };
    output: {
      hasConnections: boolean;
    };
    meta: object;
  }>;
}>>;
//#endregion
//#region src/trpc/routers/subscription.d.ts
/**
 * tRPC router for plan change subscriptions.
 * Allows clients to subscribe to and poll for changes to a plan.
 */
/**
 * Subscription router - manages change notification subscriptions.
 */
declare const subscriptionRouter: _trpc_server28.TRPCBuiltRouter<{
  ctx: Context;
  meta: object;
  errorShape: _trpc_server28.TRPCDefaultErrorShape;
  transformer: false;
}, _trpc_server28.TRPCDecorateCreateRouterOptions<{
  /**
   * Create a subscription to receive change notifications for a plan.
   * POST /api/plan/:id/subscribe
   */
  create: _trpc_server28.TRPCMutationProcedure<{
    input: {
      planId: string;
      subscribe?: string[] | undefined;
      windowMs?: number | undefined;
      maxWindowMs?: number | undefined;
      threshold?: number | undefined;
    };
    output: {
      clientId: string;
    };
    meta: object;
  }>;
  /**
   * Get pending changes for a subscription.
   * GET /api/plan/:id/changes?clientId=xxx
   */
  getChanges: _trpc_server28.TRPCQueryProcedure<{
    input: {
      planId: string;
      clientId: string;
    };
    output: {
      ready: true;
      changes: string;
      details: {
        type: "status" | "content" | "artifacts" | "resolved" | "comments";
        timestamp: number;
        summary: string;
        details?: Record<string, unknown> | undefined;
      }[];
    } | {
      ready: false;
      pending: number;
      windowExpiresIn: number;
    };
    meta: object;
  }>;
  /**
   * Delete a subscription.
   * DELETE /api/plan/:id/unsubscribe?clientId=xxx
   */
  delete: _trpc_server28.TRPCMutationProcedure<{
    input: {
      planId: string;
      clientId: string;
    };
    output: {
      success: boolean;
    };
    meta: object;
  }>;
}>>;
//#endregion
//#region src/trpc/index.d.ts
/**
 * tRPC router exports for shipyard.
 *
 * This module provides:
 * - Combined app router with all sub-routers
 * - Type exports for client type inference
 * - Context type for server implementation
 */
declare const appRouter: _trpc_server28.TRPCBuiltRouter<{
  ctx: Context;
  meta: object;
  errorShape: _trpc_server28.TRPCDefaultErrorShape;
  transformer: false;
}, _trpc_server28.TRPCDecorateCreateRouterOptions<{
  hook: _trpc_server28.TRPCBuiltRouter<{
    ctx: Context;
    meta: object;
    errorShape: _trpc_server28.TRPCDefaultErrorShape;
    transformer: false;
  }, _trpc_server28.TRPCDecorateCreateRouterOptions<{
    createSession: _trpc_server28.TRPCMutationProcedure<{
      input: {
        sessionId: string;
        agentType?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
      };
      output: {
        planId: string;
        url: string;
      };
      meta: object;
    }>;
    updateContent: _trpc_server28.TRPCMutationProcedure<{
      input: {
        planId: string;
        content: string;
        filePath?: string | undefined;
      };
      output: {
        success: boolean;
        updatedAt: number;
      };
      meta: object;
    }>;
    getReviewStatus: _trpc_server28.TRPCQueryProcedure<{
      input: {
        planId: string;
      };
      output: {
        status: "draft";
      } | {
        status: "pending_review";
        reviewRequestId: string;
      } | {
        status: "changes_requested";
        reviewedAt: number;
        reviewedBy: string;
        reviewComment?: string | undefined;
        feedback?: {
          threadId: string;
          comments: {
            author: string;
            content: string;
            createdAt: number;
          }[];
          blockId?: string | undefined;
        }[] | undefined;
      } | {
        status: "in_progress";
        reviewedAt: number;
        reviewedBy: string;
      } | {
        status: "completed";
        completedAt: number;
        completedBy: string;
        snapshotUrl?: string | undefined;
      };
      meta: object;
    }>;
    updatePresence: _trpc_server28.TRPCMutationProcedure<{
      input: {
        planId: string;
        agentType: string;
        sessionId: string;
      };
      output: {
        success: boolean;
      };
      meta: object;
    }>;
    setSessionToken: _trpc_server28.TRPCMutationProcedure<{
      input: {
        planId: string;
        sessionTokenHash: string;
      };
      output: {
        url: string;
      };
      meta: object;
    }>;
    waitForApproval: _trpc_server28.TRPCMutationProcedure<{
      input: {
        planId: string;
        reviewRequestId: string;
      };
      output: {
        approved: boolean;
        feedback?: string | undefined;
        deliverables?: any[] | undefined;
        reviewComment?: string | undefined;
        reviewedBy?: string | undefined;
        status?: string | undefined;
      };
      meta: object;
    }>;
    getDeliverableContext: _trpc_server28.TRPCQueryProcedure<{
      input: {
        planId: string;
        sessionToken: string;
      };
      output: {
        context: string;
      };
      meta: object;
    }>;
    getSessionContext: _trpc_server28.TRPCQueryProcedure<{
      input: {
        sessionId: string;
      };
      output: {
        found: true;
        planId: string;
        sessionToken: string;
        url: string;
        deliverables: {
          id: string;
          text: string;
        }[];
        reviewComment?: string | undefined;
        reviewedBy?: string | undefined;
        reviewStatus?: string | undefined;
      } | {
        found: false;
      };
      meta: object;
    }>;
  }>>;
  plan: _trpc_server28.TRPCBuiltRouter<{
    ctx: Context;
    meta: object;
    errorShape: _trpc_server28.TRPCDefaultErrorShape;
    transformer: false;
  }, _trpc_server28.TRPCDecorateCreateRouterOptions<{
    getStatus: _trpc_server28.TRPCQueryProcedure<{
      input: {
        planId: string;
      };
      output: {
        status: string;
      };
      meta: object;
    }>;
    hasConnections: _trpc_server28.TRPCQueryProcedure<{
      input: {
        planId: string;
      };
      output: {
        hasConnections: boolean;
      };
      meta: object;
    }>;
  }>>;
  subscription: _trpc_server28.TRPCBuiltRouter<{
    ctx: Context;
    meta: object;
    errorShape: _trpc_server28.TRPCDefaultErrorShape;
    transformer: false;
  }, _trpc_server28.TRPCDecorateCreateRouterOptions<{
    create: _trpc_server28.TRPCMutationProcedure<{
      input: {
        planId: string;
        subscribe?: string[] | undefined;
        windowMs?: number | undefined;
        maxWindowMs?: number | undefined;
        threshold?: number | undefined;
      };
      output: {
        clientId: string;
      };
      meta: object;
    }>;
    getChanges: _trpc_server28.TRPCQueryProcedure<{
      input: {
        planId: string;
        clientId: string;
      };
      output: {
        ready: true;
        changes: string;
        details: {
          type: "status" | "content" | "artifacts" | "resolved" | "comments";
          timestamp: number;
          summary: string;
          details?: Record<string, unknown> | undefined;
        }[];
      } | {
        ready: false;
        pending: number;
        windowExpiresIn: number;
      };
      meta: object;
    }>;
    delete: _trpc_server28.TRPCMutationProcedure<{
      input: {
        planId: string;
        clientId: string;
      };
      output: {
        success: boolean;
      };
      meta: object;
    }>;
  }>>;
  conversation: _trpc_server28.TRPCBuiltRouter<{
    ctx: Context;
    meta: object;
    errorShape: _trpc_server28.TRPCDefaultErrorShape;
    transformer: false;
  }, _trpc_server28.TRPCDecorateCreateRouterOptions<{
    import: _trpc_server28.TRPCMutationProcedure<{
      input: {
        a2aMessages: {
          [x: string]: unknown;
          messageId: string;
          role: "user" | "agent";
          contextId?: string | undefined;
          taskId?: string | undefined;
          referenceTaskIds?: string[] | undefined;
          metadata?: Record<string, unknown> | undefined;
          extensions?: string[] | undefined;
        }[];
        meta?: {
          planId?: string | undefined;
          sourcePlatform?: string | undefined;
          sessionId?: string | undefined;
        } | undefined;
      };
      output: {
        success: true;
        sessionId: string;
        transcriptPath: string;
        messageCount: number;
      } | {
        success: false;
        error: string;
      };
      meta: object;
    }>;
  }>>;
}>>;
type AppRouter = typeof appRouter;
//#endregion
//#region src/user-helpers.d.ts
/**
 * User profile stored in the Y.Doc users map.
 */
interface UserProfile {
  displayName: string;
  color: string;
}
/**
 * Create a user resolver function bound to a specific Y.Doc.
 * Useful when resolving multiple users in a loop.
 *
 * @param ydoc - Y.Doc containing the users map
 * @param fallbackLength - Length of userId to use as fallback (default: 8)
 * @returns Function that resolves user IDs to display names
 */
declare function createUserResolver(ydoc: Y.Doc, fallbackLength?: number): (userId: string) => string;
//#endregion
//#region src/yjs-keys.d.ts
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
declare const YDOC_KEYS: {
  /**
   * Plan metadata (Y.Map<string, unknown>)
   * Contains: id, title, status, createdAt, updatedAt, reviewedAt, reviewedBy, repo, pr
   *
   * Used by:
   * - Server: packages/server/src/tools/create-plan.ts (write)
   * - Web: packages/web/src/pages/PlanPage.tsx (read)
   * - Web: packages/web/src/hooks/useHydration.ts (write)
   * - Web: packages/web/src/components/ReviewActions.tsx (write)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  readonly METADATA: "metadata";
  /**
   * BlockNote document (Y.XmlFragment) - SOURCE OF TRUTH for plan content
   * Used for: Real-time collaborative editing, read_plan tool, all content operations
   *
   * CRITICAL: BlockNote expects this to be an XmlFragment, NOT an Array!
   * This is the authoritative source for all plan content.
   *
   * Used by:
   * - Server: apps/server/src/tools/create-plan.ts (write via blocksToYXmlFragment)
   * - Server: apps/server/src/export-markdown.ts (read via yXmlFragmentToBlocks)
   * - Web: apps/web/src/components/PlanViewer.tsx (BlockNote collaboration)
   * - Web: apps/web/src/hooks/useHydration.ts (write from URL snapshot)
   */
  readonly DOCUMENT_FRAGMENT: "document";
  /**
   * Comment threads (Y.Map<string, Thread>)
   * Managed by BlockNote's YjsThreadStore
   *
   * Structure: Map of thread ID → Thread object with comments array
   *
   * Used by:
   * - Web: packages/web/src/components/PlanViewer.tsx (YjsThreadStore initialization)
   * - Web: packages/web/src/components/CommentsPanel.tsx (read)
   * - Server: packages/server/src/tools/get-feedback.ts (read)
   */
  readonly THREADS: "threads";
  /**
   * Step completion status (Y.Map<string, boolean>)
   * Maps step ID → completion status
   *
   * Used by:
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  readonly STEP_COMPLETIONS: "stepCompletions";
  /**
   * Plan index (Y.Map<string, PlanIndexEntry>)
   * Only used in the special PLAN_INDEX_DOC_NAME document
   * Maps plan ID → index entry (title, status, timestamps)
   *
   * Used by:
   * - Web: packages/web/src/hooks/usePlanIndex.ts (read)
   * - Helpers: packages/schema/src/plan-index-helpers.ts (read/write)
   */
  readonly PLANS: "plans";
  /**
   * Artifact references (Y.Array<Artifact>)
   * Contains: id, type, filename, url
   * Binary content lives in GitHub orphan branch, not in CRDT
   *
   * Used by:
   * - Server: apps/server/src/tools/add-artifact.ts (write)
   * - Web: apps/web/src/components/Attachments.tsx (read)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  readonly ARTIFACTS: "artifacts";
  /**
   * Deliverables extracted from plan (Y.Array<Deliverable>)
   * Contains checkboxes marked with {#deliverable} tag
   * Linked to artifacts when agent uploads proof
   *
   * Used by:
   * - Server: apps/server/src/tools/create-plan.ts (write)
   * - Server: apps/server/src/tools/add-artifact.ts (update on link)
   * - Web: apps/web/src/components/DeliverablesView.tsx (read)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  readonly DELIVERABLES: "deliverables";
  /**
   * Agent presence (Y.Map<string, AgentPresence>)
   * Maps session ID → presence info (agentType, connectedAt, lastSeenAt)
   * Used for real-time "Claude is here" indicator
   *
   * Used by:
   * - Server: apps/server/src/registry-server.ts (write via hook API)
   * - Web: apps/web/src/components/PresenceIndicator.tsx (read)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  readonly PRESENCE: "presence";
  /**
   * Linked PRs (Y.Array<LinkedPR>)
   * Contains GitHub PRs linked to this plan
   * Auto-populated by complete_task when it detects a PR on the current branch
   *
   * Used by:
   * - Server: apps/server/src/tools/complete-task.ts (write on auto-link)
   * - Web: apps/web/src/components/ChangesView.tsx (read)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  readonly LINKED_PRS: "linkedPRs";
  /**
   * PR Review Comments (Y.Array<PRReviewComment>)
   * Contains review comments on PR diffs
   * Can be added by AI (via MCP tool) or humans (via UI)
   *
   * Used by:
   * - Server: apps/server/src/tools/add-pr-review-comment.ts (write)
   * - Web: apps/web/src/components/MonacoDiffViewer.tsx (read/write)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  readonly PR_REVIEW_COMMENTS: "prReviewComments";
  /**
   * Plan events (Y.Array<PlanEvent>)
   * Contains timeline events for audit trail and activity display
   * Events include: plan_created, status_changed, approved, etc.
   *
   * Used by:
   * - Server: apps/server/src/tools/*.ts (write on actions)
   * - Web: apps/web/src/components/Timeline.tsx (read)
   */
  readonly EVENTS: "events";
  /**
   * Plan snapshots (Y.Array<PlanSnapshot>)
   * Contains version history snapshots taken at significant status changes.
   * Each snapshot captures content, threads summary, artifacts, and deliverables.
   * Synced via CRDT to all peers.
   *
   * Used by:
   * - Server: apps/server/src/tools/*.ts (write on status changes)
   * - Web: apps/web/src/components/VersionHistory.tsx (read)
   * - Web: apps/web/src/hooks/useSnapshots.ts (read)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  readonly SNAPSHOTS: "snapshots";
  /**
   * User input requests (Y.Array<InputRequest>)
   * Contains requests for user input from MCP tools or Hook API.
   * Allows blocking until user provides a response in the browser UI.
   *
   * Used by:
   * - Server: apps/server/src/services/input-request-manager.ts (read/write)
   * - Server: apps/server/src/tools/request-user-input.ts (create requests)
   * - Web: apps/web/src/components/InputRequestDialog.tsx (read/write responses)
   */
  readonly INPUT_REQUESTS: "inputRequests";
};
/**
 * Type-safe accessor for Y.Doc keys.
 * This ensures we can't accidentally use a wrong key.
 */
type YDocKey = (typeof YDOC_KEYS)[keyof typeof YDOC_KEYS];
/**
 * Helper to validate a key is one of the known Y.Doc keys.
 * Useful for runtime validation when keys come from external sources.
 */
declare function isValidYDocKey(key: string): key is YDocKey;
//#endregion
export { type A2ADataPart, A2ADataPartSchema, type A2AFilePart, A2AFilePartSchema, type A2AMessage, A2AMessageSchema, type A2APart, A2APartSchema, type A2ATextPart, A2ATextPartSchema, type AgentActivityData, AgentActivityDataSchema, type AgentActivityType, AgentActivityTypes, type AgentPresence, AgentPresenceSchema, type AppRouter, type ApprovalResult, type ArchiveResult, type Artifact, ArtifactSchema, type ArtifactType, type AwarenessClientId, type Change, ChangeSchema, type ChangeType, ChangeTypeSchema, type ChangesResponse, ChangesResponseSchema, type ChoiceInputRequest, type ChunkMessage, ChunkMessageSchema, type ClaudeCodeMessage, ClaudeCodeMessageSchema, type ClaudeCodeOriginMetadata, ClaudeCodeOriginMetadataSchema, type CommentBody, type ConfirmInputRequest, type Context, type ConversationContext, type ConversationExportEnd, ConversationExportEndSchema, type ConversationExportMeta, ConversationExportMetaSchema, type ConversationExportStartMeta, ConversationExportStartMetaSchema, type ConversationHandlers, type ConversationVersion, ConversationVersionSchema, type CreateChoiceInputParams, type CreateConfirmInputParams, type CreateContextFn, type CreateHookSessionRequest, CreateHookSessionRequestSchema, type CreateHookSessionResponse, CreateHookSessionResponseSchema, type CreateInputRequestParams, type CreateInviteRequest, type CreateMultilineInputParams, type CreateSubscriptionRequest, CreateSubscriptionRequestSchema, type CreateSubscriptionResponse, CreateSubscriptionResponseSchema, type CreateTextInputParams, type CursorOriginMetadata, CursorOriginMetadataSchema, type DecodedP2PMessage, type DeleteSubscriptionResponse, DeleteSubscriptionResponseSchema, type Deliverable, DeliverableSchema, type DevinOriginMetadata, DevinOriginMetadataSchema, type ExportId, type FormatThreadsOptions, type GetPlanMetadataResult, type GetReviewStatusResponse, GetReviewStatusResponseSchema, type GitHubArtifact, type GitHubPRResponse, GitHubPRResponseSchema, type GitHubUsername, type HasConnectionsResponse, HasConnectionsResponseSchema, type HookApiError, HookApiErrorSchema, type HookContext, type HookHandlers, type ImportConversationRequest, ImportConversationRequestSchema, type ImportConversationResponse, ImportConversationResponseSchema, type InitPlanMetadataParams, type InputRequest, InputRequestSchema, type InputRequestStatus, InputRequestStatusValues, type InputRequestType, InputRequestTypeValues, type InviteCreatedResponse, type InviteRedeemedNotification, type InviteRedemption, type InviteRedemptionResult, InviteRedemptionSchema, type InviteRevokedResponse, type InviteSignalingMessage, type InviteSignalingResponse, type InviteToken, InviteTokenSchema, type InvitesListResponse, type LinkedPR, LinkedPRSchema, type LinkedPRStatus, LinkedPRStatusValues, type ListInvitesRequest, type LocalArtifact, type Logger, type MultilineInputRequest, NON_PLAN_DB_NAMES, type OriginMetadata, OriginMetadataSchema, type OriginPlatform, OriginPlatformValues, P2PMessageType, type P2PMessageTypeValue, PLAN_INDEX_DOC_NAME, PLAN_INDEX_EVENT_VIEWED_BY_KEY, PLAN_INDEX_VIEWED_BY_KEY, type PRReviewComment, PRReviewCommentSchema, type ParseTranscriptResult, type PlanEvent, PlanEventSchema, type PlanEventType, PlanEventTypes, type PlanId, type PlanIdInput, PlanIdSchema, type PlanIndexEntry, PlanIndexEntrySchema, type PlanMetadata, type PlanMetadataBaseUpdate, PlanMetadataSchema, type PlanSnapshot, PlanSnapshotSchema, type PlanStatusResponse, PlanStatusResponseSchema, type PlanStatusType, PlanStatusValues, type PlanStore, type PlanViewTab, PlanViewTabValues, ROUTES, type RedeemInviteRequest, type RegisterServerRequest, RegisterServerRequestSchema, type RegisterServerResponse, RegisterServerResponseSchema, type ReviewComment, ReviewCommentSchema, type ReviewFeedback, ReviewFeedbackSchema, type ReviewRequestId, type RevokeInviteRequest, type RoutePath, type SessionContextResult, type SessionToken, type SetSessionTokenRequest, SetSessionTokenRequestSchema, type SetSessionTokenResponse, SetSessionTokenResponseSchema, type StatusTransition, type StepCompletion, type SubscriptionClientIdInput, SubscriptionClientIdSchema, type SubscriptionCreateParams, type TextInputRequest, type Thread, type ThreadComment, ThreadCommentSchema, ThreadSchema, type TransitionResult, type TransitionToChangesRequested, type TransitionToCompleted, type TransitionToInProgress, type TransitionToPendingReview, type UnregisterServerRequest, UnregisterServerRequestSchema, type UnregisterServerResponse, UnregisterServerResponseSchema, type UpdatePlanContentRequest, UpdatePlanContentRequestSchema, type UpdatePlanContentResponse, UpdatePlanContentResponseSchema, type UpdatePresenceRequest, UpdatePresenceRequestSchema, type UpdatePresenceResponse, UpdatePresenceResponseSchema, type UrlEncodedPlan, type UrlEncodedPlanV1, type UrlEncodedPlanV2, type UrlKeyVersion, type UrlSnapshotRef, type UserProfile, VALID_STATUS_TRANSITIONS, type WebRTCPeerId, YDOC_KEYS, type YDocKey, a2aToClaudeCode, addArtifact, addConversationVersion, addDeliverable, addPRReviewComment, addPlanTag, addSnapshot, answerInputRequest, appRouter, approveUser, archivePlan, asAwarenessClientId, asGitHubUsername, asPlanId, asWebRTCPeerId, assertNever, assertNeverP2PMessage, buildInviteUrl, cancelInputRequest, claudeCodeToA2A, clearAgentPresence, clearEventViewedBy, clearPlanIndexViewedBy, conversationRouter, createGitHubArtifact, createHandedOffConversationVersion, createInitialConversationVersion, createInputRequest, createLinkedPR, createLocalArtifact, createPlanSnapshot, createPlanUrl, createPlanUrlWithHistory, createUserResolver, decodeChunkMessage, decodeExportEndMessage, decodeExportStartMessage, decodeP2PMessage, decodePlan, encodeChunkMessage, encodeExportEndMessage, encodeExportStartMessage, encodePlan, extractDeliverables, extractMentions, extractTextFromCommentBody, formatAsClaudeCodeJSONL, formatDeliverablesForLLM, formatThreadsForLLM, getAgentPresence, getAgentPresences, getAllEventViewedByForPlan, getAllTagsFromIndex, getAllViewedByFromIndex, getApprovedUsers, getArtifactUrl, getArtifacts, getConversationVersions, getDeliverables, getLatestSnapshot, getLinkedPR, getLinkedPRs, getPRReviewComments, getPRReviewCommentsForPR, getPlanEvents, getPlanFromUrl, getPlanIndex, getPlanIndexEntry, getPlanMetadata, getPlanMetadataWithValidation, getPlanOwnerId, getRejectedUsers, getSnapshots, getStepCompletions, getTokenTimeRemaining, getViewedBy, getViewedByFromIndex, hookRouter, initPlanMetadata, isApprovalRequired, isConversationChunk, isConversationExportEnd, isConversationExportStart, isEventUnread, isInboxWorthy, isP2PConversationMessage, isPlanUnread, isStepCompleted, isThread, isUrlEncodedPlanV1, isUrlEncodedPlanV2, isUserApproved, isUserRejected, isValidYDocKey, linkArtifactToDeliverable, linkPR, logPlanEvent, markEventAsViewed, markPlanAsViewed, markVersionHandedOff, parseClaudeCodeOrigin, parseClaudeCodeTranscriptString, parseInviteFromUrl, parseThreads, planRouter, rejectUser, removeArtifact, removePRReviewComment, removePlanIndexEntry, removePlanTag, removeViewedByFromIndex, resolvePRReviewComment, revokeUser, setAgentPresence, setPlanIndexEntry, setPlanMetadata, subscriptionRouter, summarizeA2AConversation, toggleStepCompletion, touchPlanIndexEntry, transitionPlanStatus, unarchivePlan, unlinkPR, unrejectUser, updateLinkedPRStatus, updatePlanIndexViewedBy, validateA2AMessages };
//# sourceMappingURL=index.d.mts.map