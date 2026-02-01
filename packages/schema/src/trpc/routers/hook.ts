/**
 * tRPC router for hook API endpoints.
 * These endpoints are called by the Claude Code hook to manage plan sessions.
 */

import type { Deliverable } from "@schema/plan.js";
import { DeliverableSchema } from "@schema/plan.js";
import type * as Y from "yjs";
import { z } from "zod";
import type { Logger } from "../context.js";
import {
	CreateHookSessionRequestSchema,
	CreateHookSessionResponseSchema,
	GetDeliverableContextRequestSchema,
	GetDeliverableContextResponseSchema,
	GetReviewStatusResponseSchema,
	PlanIdSchema,
	SetSessionTokenRequestSchema,
	SetSessionTokenResponseSchema,
	UpdatePlanContentRequestSchema,
	UpdatePlanContentResponseSchema,
	UpdatePresenceRequestSchema,
	UpdatePresenceResponseSchema,
} from "../schemas.js";
import { publicProcedure, router } from "../trpc.js";

/**
 * Hook router - manages plan sessions from Claude Code hook.
 *
 * Handler logic is injected via context to keep this router package-agnostic.
 * The actual business logic lives in the server package's hook-handlers.ts.
 */

export type ApprovalResult =
	| {
			approved: true;
			deliverables: Deliverable[];
			reviewComment?: string;
			reviewedBy: string;
			status: "in_progress";
	  }
	| {
			approved: false;
			feedback: string;
			status: "changes_requested" | "timeout";
			reviewComment?: string;
			reviewedBy?: string;
	  };

export type SessionContextResult =
	| {
			found: true;
			planId: string;
			sessionToken: string;
			url: string;
			deliverables: Array<{ id: string; text: string }>;
			reviewComment?: string;
			reviewedBy?: string;
			reviewStatus?: string;
	  }
	| { found: false };

export const hookRouter = router({
	/**
	 * Create a new plan session.
	 * POST /api/hook/session
	 */
	createSession: publicProcedure
		.input(CreateHookSessionRequestSchema)
		.output(CreateHookSessionResponseSchema)
		.mutation(async ({ input, ctx }) => {
			const handlers = ctx.hookHandlers;
			return handlers.createSession(input, ctx);
		}),

	/**
	 * Update plan content with markdown.
	 * PUT /api/hook/plan/:id/content
	 */
	updateContent: publicProcedure
		.input(PlanIdSchema.merge(UpdatePlanContentRequestSchema))
		.output(UpdatePlanContentResponseSchema)
		.mutation(async ({ input, ctx }) => {
			const { planId, ...contentInput } = input;
			const handlers = ctx.hookHandlers;
			return handlers.updateContent(planId, contentInput, ctx);
		}),

	/**
	 * Get review status for a plan.
	 * GET /api/hook/plan/:id/review
	 */
	getReviewStatus: publicProcedure
		.input(PlanIdSchema)
		.output(GetReviewStatusResponseSchema)
		.query(async ({ input, ctx }) => {
			const handlers = ctx.hookHandlers;
			return handlers.getReviewStatus(input.planId, ctx);
		}),

	/**
	 * Update agent presence in a plan.
	 * POST /api/hook/plan/:id/presence
	 */
	updatePresence: publicProcedure
		.input(PlanIdSchema.merge(UpdatePresenceRequestSchema))
		.output(UpdatePresenceResponseSchema)
		.mutation(async ({ input, ctx }) => {
			const { planId, ...presenceInput } = input;
			const handlers = ctx.hookHandlers;
			return handlers.updatePresence(planId, presenceInput, ctx);
		}),

	/**
	 * Set session token for a plan.
	 * POST /api/hook/plan/:id/session-token
	 */
	setSessionToken: publicProcedure
		.input(PlanIdSchema.merge(SetSessionTokenRequestSchema))
		.output(SetSessionTokenResponseSchema)
		.mutation(async ({ input, ctx }) => {
			const { planId, sessionTokenHash } = input;
			const handlers = ctx.hookHandlers;
			return handlers.setSessionToken(planId, sessionTokenHash, ctx);
		}),

	/**
	 * Wait for approval decision (blocking).
	 * Called by hook to wait for browser approval/rejection.
	 * POST /api/hook/plan/:id/wait-approval
	 */
	waitForApproval: publicProcedure
		.input(z.object({ planId: z.string(), reviewRequestId: z.string() }))
		.output(
			z.object({
				approved: z.boolean(),
				feedback: z.string().optional(),
				deliverables: z.array(DeliverableSchema).optional(),
				reviewComment: z.string().optional(),
				reviewedBy: z.string().optional(),
				status: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { planId, reviewRequestId } = input;
			const handlers = ctx.hookHandlers;
			return handlers.waitForApproval(planId, reviewRequestId, ctx);
		}),

	/**
	 * Get formatted deliverable context for post-exit injection.
	 * Returns pre-formatted context string for Claude Code.
	 * GET /api/hook/plan/:id/deliverable-context
	 */
	getDeliverableContext: publicProcedure
		.input(PlanIdSchema.merge(GetDeliverableContextRequestSchema))
		.output(GetDeliverableContextResponseSchema)
		.query(async ({ input, ctx }) => {
			const { planId, sessionToken } = input;
			const handlers = ctx.hookHandlers;
			return handlers.getDeliverableContext(planId, sessionToken, ctx);
		}),

	/**
	 * Get session context (for post-exit injection).
	 * Returns session data and deletes it from server registry.
	 * GET /api/hook/session/:sessionId/context
	 */
	getSessionContext: publicProcedure
		.input(z.object({ sessionId: z.string() }))
		.output(
			z.discriminatedUnion("found", [
				z.object({
					found: z.literal(true),
					planId: z.string(),
					sessionToken: z.string(),
					url: z.string(),
					deliverables: z.array(z.object({ id: z.string(), text: z.string() })),
					reviewComment: z.string().optional(),
					reviewedBy: z.string().optional(),
					reviewStatus: z.string().optional(),
				}),
				z.object({ found: z.literal(false) }),
			]),
		)
		.query(async ({ input, ctx }) => {
			const handlers = ctx.hookHandlers;
			return handlers.getSessionContext(input.sessionId, ctx);
		}),
});

/**
 * Minimal context interface required by hook handlers.
 * This avoids circular dependencies with the full Context type.
 */
export interface HookContext {
	getOrCreateDoc: (planId: string) => Promise<Y.Doc>;
	logger: Logger;
}

/**
 * Handler interface for hook operations.
 * Implemented by server package to provide actual business logic.
 */
export interface HookHandlers {
	createSession: (
		input: z.infer<typeof CreateHookSessionRequestSchema>,
		ctx: HookContext,
	) => Promise<z.infer<typeof CreateHookSessionResponseSchema>>;

	updateContent: (
		planId: string,
		input: z.infer<typeof UpdatePlanContentRequestSchema>,
		ctx: HookContext,
	) => Promise<z.infer<typeof UpdatePlanContentResponseSchema>>;

	getReviewStatus: (
		planId: string,
		ctx: HookContext,
	) => Promise<z.infer<typeof GetReviewStatusResponseSchema>>;

	updatePresence: (
		planId: string,
		input: z.infer<typeof UpdatePresenceRequestSchema>,
		ctx: HookContext,
	) => Promise<z.infer<typeof UpdatePresenceResponseSchema>>;

	setSessionToken: (
		planId: string,
		sessionTokenHash: string,
		ctx: HookContext,
	) => Promise<z.infer<typeof SetSessionTokenResponseSchema>>;

	waitForApproval: (
		planId: string,
		reviewRequestId: string,
		ctx: HookContext,
	) => Promise<ApprovalResult>;

	getDeliverableContext: (
		planId: string,
		sessionToken: string,
		ctx: HookContext,
	) => Promise<z.infer<typeof GetDeliverableContextResponseSchema>>;

	getSessionContext: (
		sessionId: string,
		ctx: HookContext,
	) => Promise<SessionContextResult>;
}

export type HookRouter = typeof hookRouter;
