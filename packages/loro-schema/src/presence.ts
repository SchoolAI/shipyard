/**
 * Presence/Ephemeral schemas for Shipyard.
 *
 * Uses Loro's Ephemeral Store for real-time peer presence.
 * This data is transient (not persisted), low-latency, and self-cleaning.
 *
 * @see https://loro-extended docs/presence.md
 */

import { type Infer, Shape } from '@loro-extended/change';

/**
 * Environment context for agent identification.
 * Helps users distinguish agents working from different machines/branches.
 */
const EnvironmentContextSchema = Shape.plain.struct({
  /** Git remote/project name */
  project: Shape.plain.string().nullable(),
  /** Current git branch */
  branch: Shape.plain.string().nullable(),
  /** Machine hostname */
  hostname: Shape.plain.string().nullable(),
});

/**
 * Browser context for browser peer identification.
 * Includes browser type, OS, and last active timestamp.
 */
const BrowserContextSchema = Shape.plain.struct({
  /** Browser name (e.g., "Chrome", "Firefox", "Safari") */
  browser: Shape.plain.string().nullable(),
  /** Operating system (e.g., "macOS", "Windows", "Linux", "iOS", "Android") */
  os: Shape.plain.string().nullable(),
  /** Last activity timestamp */
  lastActive: Shape.plain.number().nullable(),
});

/**
 * Presence schema for a peer in the room.
 * Each peer broadcasts their presence via the ephemeral store.
 */
export const PresenceSchema = Shape.plain.struct({
  /** Display name for the peer */
  name: Shape.plain.string(),
  /** Color for visual identification (hex string) */
  color: Shape.plain.string(),
  /** Platform type (e.g., "browser", "claude-code", "mcp-server") */
  platform: Shape.plain.string(),
  /** Whether this peer is the owner of the current plan */
  isOwner: Shape.plain.boolean(),
  /** Connection timestamp */
  connectedAt: Shape.plain.number(),
  /**
   * Whether this peer has a connected daemon for agent launching.
   * Used for P2P agent launching - mobile browsers can launch agents
   * via peers that have daemon connections.
   */
  hasDaemon: Shape.plain.boolean(),
  /** Environment context for agent identification */
  context: EnvironmentContextSchema.nullable(),
  /** Browser context for browser peer identification */
  browserContext: BrowserContextSchema.nullable(),
});

/**
 * Ephemeral declarations for the Room document.
 * Use this as the third argument to useHandle for the room.
 *
 * @example
 * ```tsx
 * const roomHandle = useHandle(ROOM_DOC_ID, RoomSchema, RoomEphemeralDeclarations);
 * const { self, peers } = useEphemeral(roomHandle.presence);
 * ```
 */
export const RoomEphemeralDeclarations = {
  presence: PresenceSchema,
} as const;

export type PeerPresence = Infer<typeof PresenceSchema>;
export type EnvironmentContext = Infer<typeof EnvironmentContextSchema>;
export type BrowserContext = Infer<typeof BrowserContextSchema>;
