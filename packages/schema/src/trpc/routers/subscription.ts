/**
 * tRPC router for plan change subscriptions.
 * Allows clients to subscribe to and poll for changes to a plan.
 */

import { TRPCError } from "@trpc/server";
import {
	ChangesResponseSchema,
	CreateSubscriptionRequestSchema,
	CreateSubscriptionResponseSchema,
	DeleteSubscriptionResponseSchema,
	PlanIdSchema,
	SubscriptionClientIdSchema,
} from "../schemas.js";
import { publicProcedure, router } from "../trpc.js";

/**
 * Subscription router - manages change notification subscriptions.
 */
export const subscriptionRouter = router({
	/**
	 * Create a subscription to receive change notifications for a plan.
	 * POST /api/plan/:id/subscribe
	 */
	create: publicProcedure
		.input(PlanIdSchema.merge(CreateSubscriptionRequestSchema))
		.output(CreateSubscriptionResponseSchema)
		.mutation(async ({ input, ctx }) => {
			const { planId, subscribe, windowMs, maxWindowMs, threshold } = input;
			const planStore = ctx.getPlanStore();

			const clientId = planStore.createSubscription({
				planId,
				subscribe: subscribe ?? ["status"],
				windowMs: windowMs ?? 5000,
				maxWindowMs: maxWindowMs ?? 30000,
				threshold: threshold ?? 1,
			});

			return { clientId };
		}),

	/**
	 * Get pending changes for a subscription.
	 * GET /api/plan/:id/changes?clientId=xxx
	 */
	getChanges: publicProcedure
		.input(SubscriptionClientIdSchema)
		.output(ChangesResponseSchema)
		.query(async ({ input, ctx }) => {
			const { planId, clientId } = input;
			const planStore = ctx.getPlanStore();

			const result = planStore.getChanges(planId, clientId);
			if (!result) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Subscription not found",
				});
			}

			return result;
		}),

	/**
	 * Delete a subscription.
	 * DELETE /api/plan/:id/unsubscribe?clientId=xxx
	 */
	delete: publicProcedure
		.input(SubscriptionClientIdSchema)
		.output(DeleteSubscriptionResponseSchema)
		.mutation(async ({ input, ctx }) => {
			const { planId, clientId } = input;
			const planStore = ctx.getPlanStore();

			const success = planStore.deleteSubscription(planId, clientId);
			return { success };
		}),
});

export type SubscriptionRouter = typeof subscriptionRouter;
