/**
 * Durable Object state types.
 */

import type { AgentInfo as SchemaAgentInfo } from '@shipyard/session';

/** Agent registered in PersonalRoom -- extends the schema type with server-only fields */
export interface AgentInfo extends SchemaAgentInfo {
  registeredAt: number;
  lastSeenAt: number;
}

/** Browser session in PersonalRoom */
export interface BrowserSession {
  sessionId: string;
  connectedAt: number;
  userAgent?: string;
}

/** Participant in CollabRoom */
export interface Participant {
  userId: string;
  username: string;
  joinedAt: number;
  role: 'owner' | 'collaborator';
}

/** Connection type for PersonalRoom */
export type PersonalConnectionType = 'agent' | 'browser';

/** Serialized state for WebSocket hibernation (PersonalRoom) */
export interface SerializedPersonalConnectionState {
  id: string;
  type: PersonalConnectionType;
  userId: string;
  username: string;
  machineId?: string;
  agentId?: string;
  sessionId?: string;
}

/** Serialized state for WebSocket hibernation (CollabRoom) */
export interface SerializedCollabConnectionState {
  id: string;
  userId: string;
  username: string;
  role: 'owner' | 'collaborator';
}

/** Claims passed from route to DO via header */
export interface PassedClaims {
  sub: string;
  ghUser: string;
  ghId: number;
}

/** Collab payload passed from route to DO via header */
export interface PassedCollabPayload {
  roomId: string;
  taskId: string;
  inviterId: string;
  exp: number;
  /** User claims from JWT (may be absent for anonymous access) */
  userClaims?: {
    sub: string;
    ghUser: string;
  };
}
