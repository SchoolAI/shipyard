/**
 * Auth-related type definitions.
 */

/** GitHub user info from API */
export interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  avatar_url?: string;
}

/** Shipyard JWT claims */
export interface ShipyardJWTClaims {
  /** Shipyard user ID (internal, derived from GitHub ID) */
  sub: string;
  /** GitHub username */
  ghUser: string;
  /** GitHub user ID */
  ghId: number;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
  /** Optional: Scope for agent tokens (e.g., 'task:abc123') */
  scope?: string;
  /** Optional: Machine ID for agent tokens */
  machineId?: string;
}

/** OAuth token exchange request body */
export interface TokenExchangeRequest {
  code: string;
  redirect_uri: string;
}

/** OAuth token exchange response */
export interface TokenExchangeResponse {
  token: string;
  user: {
    id: string;
    username: string;
  };
  is_mobile?: boolean;
}

/** Pre-signed URL payload for collab rooms */
export interface PresignedUrlPayload {
  roomId: string;
  taskId: string;
  inviterId: string;
  exp: number;
}
