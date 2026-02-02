/**
 * Subscription system for change notifications.
 *
 * Exports:
 * - Types for subscriptions and changes
 * - Manager for creating/deleting/polling subscriptions
 * - Observers for attaching to Y.Doc
 */

export {
	createSubscription,
	deleteSubscription,
	getChanges,
	getSubscription,
	getSubscriptionsForPlan,
	notifyChange,
	startCleanupInterval,
} from "./manager.js";
export { attachObservers, detachObservers, hasObservers } from "./observers.js";
export type {
	Change,
	ChangesResponse,
	ChangeType,
	Subscription,
	SubscriptionConfig,
} from "./types.js";
