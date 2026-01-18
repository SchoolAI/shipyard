/**
 * Types for the notification subscription system.
 */

import type { Change, ChangesResponse, ChangeType } from '@peer-plan/schema';

export type { Change, ChangesResponse, ChangeType };

export interface SubscriptionConfig {
  planId: string;
  subscribe: ChangeType[];
  windowMs: number;
  maxWindowMs: number;
  threshold: number;
}

export interface Subscription {
  id: string;
  config: SubscriptionConfig;
  pendingChanges: Change[];
  windowStartedAt: number | null;
  lastFlushedAt: number;
  lastActivityAt: number;
  ready: boolean;
}
