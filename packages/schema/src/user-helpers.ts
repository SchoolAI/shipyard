import type * as Y from 'yjs';

/**
 * User profile stored in the Y.Doc users map.
 */
export interface UserProfile {
  displayName: string;
  color: string;
}

/**
 * Create a user resolver function bound to a specific Y.Doc.
 * Useful when resolving multiple users in a loop.
 *
 * @param ydoc - Y.Doc containing the users map
 * @param fallbackLength - Length of userId to use as fallback (default: 8)
 * @returns Function that resolves user IDs to display names
 */
export function createUserResolver(
  ydoc: Y.Doc,
  fallbackLength = 8
): (userId: string) => string {
  const usersMap = ydoc.getMap<UserProfile>('users');

  return (userId: string): string => {
    const userData = usersMap.get(userId);
    return userData?.displayName ?? userId.slice(0, fallbackLength);
  };
}
