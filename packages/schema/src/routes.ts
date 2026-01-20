/**
 * Type-safe API route definitions for registry server.
 * Use these instead of hardcoded strings to prevent typos.
 */

export const ROUTES = {
  REGISTRY_LIST: '/registry',
  REGISTRY_REGISTER: '/register',
  REGISTRY_UNREGISTER: '/unregister',

  PLAN_STATUS: (planId: string) => `/api/plan/${planId}/status`,
  PLAN_HAS_CONNECTIONS: (planId: string) => `/api/plan/${planId}/has-connections`,
  PLAN_TRANSCRIPT: (planId: string) => `/api/plan/${planId}/transcript`,
  PLAN_SUBSCRIBE: (planId: string) => `/api/plan/${planId}/subscribe`,
  PLAN_CHANGES: (planId: string) => `/api/plan/${planId}/changes`,
  PLAN_UNSUBSCRIBE: (planId: string) => `/api/plan/${planId}/unsubscribe`,

  PLAN_PR_DIFF: (planId: string, prNumber: number) => `/api/plans/${planId}/pr-diff/${prNumber}`,
  PLAN_PR_FILES: (planId: string, prNumber: number) => `/api/plans/${planId}/pr-files/${prNumber}`,

  HOOK_SESSION: '/api/hook/session',
  HOOK_CONTENT: (planId: string) => `/api/hook/plan/${planId}/content`,
  HOOK_REVIEW: (planId: string) => `/api/hook/plan/${planId}/review`,
  HOOK_SESSION_TOKEN: (planId: string) => `/api/hook/plan/${planId}/session-token`,
  HOOK_PRESENCE: (planId: string) => `/api/hook/plan/${planId}/presence`,

  CONVERSATION_IMPORT: '/api/conversation/import',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
