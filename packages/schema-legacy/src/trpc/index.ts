/**
 * tRPC router exports for shipyard.
 *
 * This module provides:
 * - Combined app router with all sub-routers
 * - Type exports for client type inference
 * - Context type for server implementation
 */

import { hookRouter } from "./routers/hook.js";
import { planRouter } from "./routers/plan.js";
import { subscriptionRouter } from "./routers/subscription.js";
import { router } from "./trpc.js";

export const appRouter = router({
	hook: hookRouter,
	plan: planRouter,
	subscription: subscriptionRouter,
});

export type AppRouter = typeof appRouter;

export type {
	Context,
	CreateContextFn,
	Logger,
	MachineInfo,
	PlanStore,
} from "./context.js";
export type {
	ApprovalResult,
	HookContext,
	HookHandlers,
	SessionContextResult,
} from "./routers/hook.js";
export { hookRouter } from "./routers/hook.js";
export { planRouter } from "./routers/plan.js";
export { subscriptionRouter } from "./routers/subscription.js";
export type {
	Change,
	ChangesResponse,
	ChangeType,
	DeleteSubscriptionResponse,
	HasConnectionsResponse,
	MachineInfoResponse,
	PlanIdInput,
	PlanStatusResponse,
	SetSessionTokenRequest,
	SetSessionTokenResponse,
	SubscriptionClientIdInput,
	SubscriptionCreateParams,
} from "./schemas.js";

export {
	ChangeSchema,
	ChangesResponseSchema,
	ChangeTypeSchema,
	DeleteSubscriptionResponseSchema,
	HasConnectionsResponseSchema,
	MachineInfoResponseSchema,
	PlanIdSchema,
	PlanStatusResponseSchema,
	SetSessionTokenRequestSchema,
	SetSessionTokenResponseSchema,
	SubscriptionClientIdSchema,
} from "./schemas.js";

/*
 * NOTE: middleware, publicProcedure, and router are NOT exported here
 * to prevent bundling @trpc/server in browser builds.
 * Server code should import these directly from './trpc.js' if needed.
 */
