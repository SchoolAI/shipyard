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
  /** Shipyard user ID ("usr_abc123") */
  sub: string;
  /** Display name */
  displayName: string;
  /** Linked OAuth providers */
  providers: string[];
  iat: number;
  exp: number;
  scope?: string;
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
    displayName: string;
    avatarUrl: string | null;
    providers: string[];
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
