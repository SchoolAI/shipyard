import type { GitHubUser } from '../auth/types';
import { generateId } from '../utils/crypto';

export interface ShipyardUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: number;
}

export interface LinkedIdentity {
  provider: string;
  providerId: string;
  userId: string;
  providerUsername: string | null;
  linkedAt: number;
}

/**
 * Find existing user by OAuth provider identity, or create a new one.
 * Returns the Shipyard user and list of linked provider names.
 */
export async function findOrCreateUser(
  provider: string,
  githubUser: GitHubUser,
  db: D1Database
): Promise<{ user: ShipyardUser; providers: string[] }> {
  const existing = await db
    .prepare('SELECT user_id FROM linked_identities WHERE provider = ? AND provider_id = ?')
    .bind(provider, String(githubUser.id))
    .first<{ user_id: string }>();

  if (existing) {
    const user = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(existing.user_id)
      .first<{ id: string; display_name: string; avatar_url: string | null; created_at: number }>();

    if (!user) throw new Error(`User ${existing.user_id} not found but linked identity exists`);

    const providers = await getProviders(user.id, db);
    return {
      user: { id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url, createdAt: user.created_at },
      providers,
    };
  }

  const userId = `usr_${generateId(21)}`;
  const now = Date.now();
  const displayName = githubUser.name ?? githubUser.login;

  await db.batch([
    db
      .prepare('INSERT INTO users (id, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?)')
      .bind(userId, displayName, githubUser.avatar_url ?? null, now),
    db
      .prepare(
        'INSERT INTO linked_identities (provider, provider_id, user_id, provider_username, linked_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(provider, String(githubUser.id), userId, githubUser.login, now),
  ]);

  return {
    user: { id: userId, displayName, avatarUrl: githubUser.avatar_url ?? null, createdAt: now },
    providers: [provider],
  };
}

async function getProviders(userId: string, db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare('SELECT provider FROM linked_identities WHERE user_id = ?')
    .bind(userId)
    .all<{ provider: string }>();
  return rows.results.map((r) => r.provider);
}

/**
 * Find a user by their Shipyard user ID.
 */
export async function findUserById(
  userId: string,
  db: D1Database
): Promise<{ user: ShipyardUser; providers: string[] } | null> {
  const user = await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; display_name: string; avatar_url: string | null; created_at: number }>();

  if (!user) return null;

  const providers = await getProviders(user.id, db);
  return {
    user: { id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url, createdAt: user.created_at },
    providers,
  };
}
