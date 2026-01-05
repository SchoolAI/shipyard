/**
 * Types for the notification subscription system.
 */

export type ChangeType = 'status' | 'comments' | 'resolved' | 'content' | 'artifacts';

export interface SubscriptionConfig {
  planId: string;
  subscribe: ChangeType[];
  windowMs: number;
  maxWindowMs: number;
  threshold: number;
}

export interface Change {
  type: ChangeType;
  timestamp: number;
  summary: string;
  details?: Record<string, unknown>;
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

export interface ChangesResponse {
  ready: boolean;
  changes?: string;
  details?: Change[];
  pending?: number;
  windowExpiresIn?: number;
}
