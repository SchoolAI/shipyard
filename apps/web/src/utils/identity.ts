/**
 * User identity management for comments and collaboration.
 *
 * Stores identity in localStorage so it persists across sessions.
 * Each user gets a unique ID, display name, and color.
 */

const STORAGE_KEY = 'peer-plan-identity';

/** Generate a random color in HSL format for good contrast */
function generateColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 50%)`;
}

/** Generate a UUID v4 */
function generateId(): string {
  return crypto.randomUUID();
}

export interface UserIdentity {
  /** Unique identifier for this user */
  id: string;
  /** Display name shown in comments */
  displayName: string;
  /** Color for cursor/highlight in collaboration */
  color: string;
  /** When the identity was created */
  createdAt: number;
}

/**
 * Get the current user's identity from localStorage.
 * Returns null if no identity has been set.
 */
export function getIdentity(): UserIdentity | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as UserIdentity;
  } catch {
    return null;
  }
}

/**
 * Save the user's identity to localStorage.
 */
export function setIdentity(identity: UserIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

/**
 * Create a new identity with the given display name.
 * Automatically generates ID and color.
 */
export function createIdentity(displayName: string): UserIdentity {
  const identity: UserIdentity = {
    id: generateId(),
    displayName,
    color: generateColor(),
    createdAt: Date.now(),
  };
  setIdentity(identity);
  return identity;
}

/**
 * Update the display name for the current identity.
 * Returns null if no identity exists.
 */
export function updateDisplayName(displayName: string): UserIdentity | null {
  const current = getIdentity();
  if (!current) return null;

  const updated: UserIdentity = {
    ...current,
    displayName,
  };
  setIdentity(updated);
  return updated;
}

/**
 * Check if the user has set up their identity.
 */
export function hasIdentity(): boolean {
  return getIdentity() !== null;
}

/**
 * Clear the user's identity from localStorage.
 */
export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}
