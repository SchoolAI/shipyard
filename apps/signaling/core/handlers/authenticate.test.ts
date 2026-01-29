/**
 * Integration tests for the two-message authentication pattern.
 *
 * Tests cover:
 * 1. Happy path: subscribe -> authenticate -> success -> publish works
 * 2. Owner auth: GitHub token validation and ownership checks
 * 3. Invite token: validation, expiration, revocation, exhaustion
 * 4. Flow integrity: proper ordering and state transitions
 * 5. Timeout behavior: 10-second auth deadline enforcement
 */

import type { InviteRedemption, InviteToken } from '@shipyard/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '../platform.js';
import type {
  AuthErrorResponse,
  AuthenticatedResponse,
  AuthenticateMessage,
  PublishMessage,
  SubscribeMessage,
} from '../types.js';
import { handleAuthenticate } from './authenticate.js';
import { handlePublish } from './publish.js';
import { checkAuthDeadlines, handleSubscribe } from './subscribe.js';

/**
 * Create a mock WebSocket for testing.
 * Uses a simple object that can be used as a key in Maps.
 */
function createMockWebSocket(id: string = 'ws-1'): { id: string; close: ReturnType<typeof vi.fn> } {
  return { id, close: vi.fn() };
}

/**
 * Create a mock PlatformAdapter for testing.
 * Uses real data structures (Maps) for state management.
 */
function createMockPlatform(): PlatformAdapter & {
  /** Access internal state for test assertions */
  _sentMessages: Map<unknown, unknown[]>;
  _pendingSubscriptions: Map<unknown, Set<string>>;
  _activeSubscriptions: Map<unknown, Set<string>>;
  _topicSubscribers: Map<string, Set<unknown>>;
  _authDeadlines: Map<unknown, number>;
  _connectionUserIds: Map<unknown, string>;
  _inviteTokens: Map<string, InviteToken>;
  _inviteRedemptions: Map<string, InviteRedemption>;
  _planOwners: Map<string, string>;
  _gitHubTokens: Map<string, string>;
} {
  /** Internal state with real data structures */
  const sentMessages = new Map<unknown, unknown[]>();
  const pendingSubscriptions = new Map<unknown, Set<string>>();
  const activeSubscriptions = new Map<unknown, Set<string>>();
  const topicSubscribers = new Map<string, Set<unknown>>();
  const authDeadlines = new Map<unknown, number>();
  const connectionUserIds = new Map<unknown, string>();
  const inviteTokens = new Map<string, InviteToken>();
  const inviteRedemptions = new Map<string, InviteRedemption>();
  const planOwners = new Map<string, string>();
  const gitHubTokens = new Map<string, string>();

  return {
    _sentMessages: sentMessages,
    _pendingSubscriptions: pendingSubscriptions,
    _activeSubscriptions: activeSubscriptions,
    _topicSubscribers: topicSubscribers,
    _authDeadlines: authDeadlines,
    _connectionUserIds: connectionUserIds,
    _inviteTokens: inviteTokens,
    _inviteRedemptions: inviteRedemptions,
    _planOwners: planOwners,
    _gitHubTokens: gitHubTokens,

    /** Storage Operations */
    getInviteToken: vi.fn(async (planId: string, tokenId: string) => {
      return inviteTokens.get(`${planId}:${tokenId}`);
    }),

    setInviteToken: vi.fn(async (planId: string, tokenId: string, token: InviteToken) => {
      inviteTokens.set(`${planId}:${tokenId}`, token);
    }),

    deleteInviteToken: vi.fn(async (planId: string, tokenId: string) => {
      inviteTokens.delete(`${planId}:${tokenId}`);
    }),

    listInviteTokens: vi.fn(async (_planId: string) => {
      return Array.from(inviteTokens.values());
    }),

    getInviteRedemption: vi.fn(async (planId: string, userId: string) => {
      return inviteRedemptions.get(`${planId}:${userId}`);
    }),

    getSpecificInviteRedemption: vi.fn(async (planId: string, tokenId: string, userId: string) => {
      return inviteRedemptions.get(`${planId}:${tokenId}:${userId}`);
    }),

    setInviteRedemption: vi.fn(
      async (planId: string, tokenId: string, userId: string, redemption: InviteRedemption) => {
        inviteRedemptions.set(`${planId}:${tokenId}:${userId}`, redemption);
        inviteRedemptions.set(`${planId}:${userId}`, redemption);
      }
    ),

    /** Crypto Operations */
    generateTokenId: vi.fn(async () => 'tok-1234'),
    generateTokenValue: vi.fn(async () => 'secret-token-value'),
    hashTokenValue: vi.fn(async (value: string) => `hash:${value}`),
    verifyTokenHash: vi.fn(async (value: string, hash: string) => {
      return hash === `hash:${value}`;
    }),

    /** WebSocket Operations */
    sendMessage: vi.fn((ws: unknown, message: unknown) => {
      const messages = sentMessages.get(ws) ?? [];
      messages.push(message);
      sentMessages.set(ws, messages);
    }),

    /** Topic Operations */
    getTopicSubscribers: vi.fn((topic: string) => {
      return Array.from(topicSubscribers.get(topic) ?? []);
    }),

    subscribeToTopic: vi.fn((ws: unknown, topic: string) => {
      const subs = activeSubscriptions.get(ws) ?? new Set();
      subs.add(topic);
      activeSubscriptions.set(ws, subs);

      const subscribers = topicSubscribers.get(topic) ?? new Set();
      subscribers.add(ws);
      topicSubscribers.set(topic, subscribers);
    }),

    unsubscribeFromTopic: vi.fn((ws: unknown, topic: string) => {
      const subs = activeSubscriptions.get(ws);
      if (subs) subs.delete(topic);

      const subscribers = topicSubscribers.get(topic);
      if (subscribers) subscribers.delete(ws);
    }),

    unsubscribeFromAllTopics: vi.fn((ws: unknown) => {
      const subs = activeSubscriptions.get(ws);
      if (subs) {
        for (const topic of subs) {
          const subscribers = topicSubscribers.get(topic);
          if (subscribers) subscribers.delete(ws);
        }
      }
      activeSubscriptions.delete(ws);
      pendingSubscriptions.delete(ws);
    }),

    /** Pending Subscription Management */
    addPendingSubscription: vi.fn((ws: unknown, topic: string) => {
      const pending = pendingSubscriptions.get(ws) ?? new Set();
      pending.add(topic);
      pendingSubscriptions.set(ws, pending);
    }),

    getPendingSubscriptions: vi.fn((ws: unknown) => {
      return Array.from(pendingSubscriptions.get(ws) ?? []);
    }),

    activatePendingSubscription: vi.fn((ws: unknown, topic: string) => {
      const pending = pendingSubscriptions.get(ws);
      if (!pending?.has(topic)) return false;

      pending.delete(topic);

      const active = activeSubscriptions.get(ws) ?? new Set();
      active.add(topic);
      activeSubscriptions.set(ws, active);

      const subscribers = topicSubscribers.get(topic) ?? new Set();
      subscribers.add(ws);
      topicSubscribers.set(topic, subscribers);

      return true;
    }),

    isSubscriptionPending: vi.fn((ws: unknown, topic: string) => {
      return pendingSubscriptions.get(ws)?.has(topic) ?? false;
    }),

    isSubscriptionActive: vi.fn((ws: unknown, topic: string) => {
      return activeSubscriptions.get(ws)?.has(topic) ?? false;
    }),

    setAuthDeadline: vi.fn((ws: unknown, timestamp: number) => {
      authDeadlines.set(ws, timestamp);
    }),

    clearAuthDeadline: vi.fn((ws: unknown) => {
      authDeadlines.delete(ws);
    }),

    getAuthDeadline: vi.fn((ws: unknown) => {
      return authDeadlines.get(ws) ?? null;
    }),

    getAllConnectionsWithDeadlines: vi.fn(() => {
      const result: Array<{ ws: unknown; deadline: number }> = [];
      for (const [ws, deadline] of authDeadlines.entries()) {
        result.push({ ws, deadline });
      }
      return result;
    }),

    setConnectionUserId: vi.fn((ws: unknown, userId: string) => {
      connectionUserIds.set(ws, userId);
    }),

    getConnectionUserId: vi.fn((ws: unknown) => {
      return connectionUserIds.get(ws) ?? null;
    }),

    /** Authentication Operations */
    validateGitHubToken: vi.fn(async (token: string) => {
      const username = gitHubTokens.get(token);
      if (username) {
        return { valid: true, username };
      }
      return { valid: false, error: 'Invalid GitHub token' };
    }),

    getPlanOwnerId: vi.fn(async (planId: string) => {
      return planOwners.get(planId) ?? null;
    }),

    setPlanOwnerId: vi.fn(async (planId: string, ownerId: string) => {
      planOwners.set(planId, ownerId);
    }),

    /** Logging */
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Helper to create a valid InviteToken for testing.
 */
function createInviteToken(overrides: Partial<InviteToken> = {}): InviteToken {
  return {
    id: 'tok-1234',
    tokenHash: 'hash:secret-token-value',
    planId: 'plan-abc',
    createdBy: 'owner-user',
    createdAt: Date.now() - 60000,
    expiresAt: Date.now() + 3600000, // 1 hour from now
    maxUses: null,
    useCount: 0,
    revoked: false,
    ...overrides,
  };
}

/**
 * Helper to get the last sent message to a WebSocket.
 */
function getLastMessage(platform: ReturnType<typeof createMockPlatform>, ws: unknown): unknown {
  const messages = platform._sentMessages.get(ws) ?? [];
  return messages[messages.length - 1];
}

/**
 * Helper to get all sent messages to a WebSocket.
 */
function getAllMessages(platform: ReturnType<typeof createMockPlatform>, ws: unknown): unknown[] {
  return platform._sentMessages.get(ws) ?? [];
}

describe('authenticate handler - two-message authentication pattern', () => {
  let platform: ReturnType<typeof createMockPlatform>;
  let ws: { id: string };

  beforeEach(() => {
    platform = createMockPlatform();
    ws = createMockWebSocket('ws-1');
  });

  describe('happy path', () => {
    it('subscribe -> authenticate (owner) -> success -> publish works', async () => {
      /** Setup: Register valid GitHub token */
      platform._gitHubTokens.set('valid-github-token', 'owner-user');

      /** Step 1: Subscribe to topic (goes to pending) */
      const subscribeMsg: SubscribeMessage = {
        type: 'subscribe',
        topics: ['shipyard-plan-abc'],
      };
      handleSubscribe(platform, ws, subscribeMsg);

      expect(platform.isSubscriptionPending(ws, 'shipyard-plan-abc')).toBe(true);
      expect(platform.isSubscriptionActive(ws, 'shipyard-plan-abc')).toBe(false);

      /** Step 2: Authenticate as owner */
      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'owner',
        userId: 'owner-user',
        githubToken: 'valid-github-token',
      };
      await handleAuthenticate(platform, ws, authMsg);

      /** Verify authentication succeeded */
      const response = getLastMessage(platform, ws) as AuthenticatedResponse;
      expect(response.type).toBe('authenticated');
      expect(response.userId).toBe('owner-user');
      expect(response.planId).toBe('plan-abc');

      /** Verify subscription is now active */
      expect(platform.isSubscriptionPending(ws, 'shipyard-plan-abc')).toBe(false);
      expect(platform.isSubscriptionActive(ws, 'shipyard-plan-abc')).toBe(true);

      /** Step 3: Publish works after authentication */
      const ws2 = createMockWebSocket('ws-2');
      platform._activeSubscriptions.set(ws2, new Set(['shipyard-plan-abc']));
      platform._topicSubscribers.set('shipyard-plan-abc', new Set([ws, ws2]));

      const publishMsg: PublishMessage = {
        type: 'publish',
        topic: 'shipyard-plan-abc',
        signal: { type: 'offer' },
      };
      handlePublish(platform, ws, publishMsg);

      /** Verify message was relayed to ws2 but not ws1 (sender) */
      const ws2Messages = getAllMessages(platform, ws2);
      expect(ws2Messages.length).toBe(1);
      expect((ws2Messages[0] as PublishMessage).type).toBe('publish');
    });

    it('subscribe -> authenticate (invite) -> success -> publish works', async () => {
      /** Setup: Create valid invite token and plan owner */
      platform._planOwners.set('plan-abc', 'owner-user');
      const inviteToken = createInviteToken({ planId: 'plan-abc' });
      platform._inviteTokens.set('plan-abc:tok-1234', inviteToken);

      /** Step 1: Subscribe to topic */
      const subscribeMsg: SubscribeMessage = {
        type: 'subscribe',
        topics: ['shipyard-plan-abc'],
      };
      handleSubscribe(platform, ws, subscribeMsg);

      /** Step 2: Authenticate with invite */
      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'invite',
        userId: 'guest-user',
        inviteToken: { tokenId: 'tok-1234', tokenValue: 'secret-token-value' },
      };
      await handleAuthenticate(platform, ws, authMsg);

      /** Verify authentication succeeded */
      const response = getLastMessage(platform, ws) as AuthenticatedResponse;
      expect(response.type).toBe('authenticated');
      expect(response.userId).toBe('guest-user');
      expect(response.planId).toBe('plan-abc');

      /** Verify subscription is now active */
      expect(platform.isSubscriptionActive(ws, 'shipyard-plan-abc')).toBe(true);

      /** Step 3: Publish works after authentication */
      const ws2 = createMockWebSocket('ws-2');
      platform._activeSubscriptions.set(ws2, new Set(['shipyard-plan-abc']));
      platform._topicSubscribers.set('shipyard-plan-abc', new Set([ws, ws2]));

      const publishMsg: PublishMessage = {
        type: 'publish',
        topic: 'shipyard-plan-abc',
        signal: { type: 'offer' },
      };
      handlePublish(platform, ws, publishMsg);

      /** Verify message was relayed */
      const ws2Messages = getAllMessages(platform, ws2);
      expect(ws2Messages.length).toBe(1);
    });
  });

  describe('owner authentication', () => {
    it('valid GitHub token + matching userId -> authenticated', async () => {
      platform._gitHubTokens.set('valid-token', 'alice');
      platform.addPendingSubscription(ws, 'shipyard-plan-123');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'valid-token',
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthenticatedResponse;
      expect(response.type).toBe('authenticated');
      expect(response.userId).toBe('alice');
      expect(response.planId).toBe('plan-123');
    });

    it('invalid GitHub token -> auth_error', async () => {
      platform.addPendingSubscription(ws, 'shipyard-plan-123');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'invalid-token',
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('invalid_token');
      expect(response.message).toContain('Invalid GitHub token');
    });

    it('valid token but userId mismatch -> unauthorized', async () => {
      platform._gitHubTokens.set('bob-token', 'bob');
      platform.addPendingSubscription(ws, 'shipyard-plan-123');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice', // Claiming to be alice but token is bob's
        githubToken: 'bob-token',
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('unauthorized');
      expect(response.message).toContain('does not match');
    });

    it('owner of plan A cannot access plan B (different owner)', async () => {
      platform._gitHubTokens.set('alice-token', 'alice');
      platform._planOwners.set('plan-B', 'bob'); // Plan B is owned by bob
      platform.addPendingSubscription(ws, 'shipyard-plan-B');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'alice-token',
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('unauthorized');
      expect(response.message).toContain('Not authorized');
    });

    it('owner can access unowned plan (claims ownership)', async () => {
      platform._gitHubTokens.set('alice-token', 'alice');
      /** Plan has no owner yet */
      platform.addPendingSubscription(ws, 'shipyard-new-plan');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'alice-token',
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthenticatedResponse;
      expect(response.type).toBe('authenticated');
      /** Plan ownership should be claimed */
      expect(platform._planOwners.get('new-plan')).toBe('alice');
    });

    it('user with invite redemption can access plan owned by another', async () => {
      platform._gitHubTokens.set('alice-token', 'alice');
      platform._planOwners.set('bob-plan', 'bob');
      /** Alice previously redeemed an invite for this plan */
      platform._inviteRedemptions.set('bob-plan:alice', {
        tokenId: 'tok-old',
        redeemedBy: 'alice',
        redeemedAt: Date.now() - 10000,
      });
      platform.addPendingSubscription(ws, 'shipyard-bob-plan');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'alice-token',
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthenticatedResponse;
      expect(response.type).toBe('authenticated');
    });
  });

  describe('invite token authentication', () => {
    it('valid invite -> authenticated', async () => {
      platform._planOwners.set('plan-abc', 'owner');
      const inviteToken = createInviteToken();
      platform._inviteTokens.set('plan-abc:tok-1234', inviteToken);
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'invite',
        userId: 'guest',
        inviteToken: { tokenId: 'tok-1234', tokenValue: 'secret-token-value' },
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthenticatedResponse;
      expect(response.type).toBe('authenticated');
      expect(response.userId).toBe('guest');
    });

    it('expired invite -> auth_error expired', async () => {
      const expiredToken = createInviteToken({
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      });
      platform._inviteTokens.set('plan-abc:tok-1234', expiredToken);
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'invite',
        userId: 'guest',
        inviteToken: { tokenId: 'tok-1234', tokenValue: 'secret-token-value' },
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('expired');
      expect(response.message).toContain('expired');
    });

    it('revoked invite -> auth_error revoked', async () => {
      const revokedToken = createInviteToken({
        revoked: true,
      });
      platform._inviteTokens.set('plan-abc:tok-1234', revokedToken);
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'invite',
        userId: 'guest',
        inviteToken: { tokenId: 'tok-1234', tokenValue: 'secret-token-value' },
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('revoked');
      expect(response.message).toContain('revoked');
    });

    it('exhausted invite (maxUses reached) -> auth_error exhausted', async () => {
      const exhaustedToken = createInviteToken({
        maxUses: 3,
        useCount: 3, // All 3 uses consumed
      });
      platform._inviteTokens.set('plan-abc:tok-1234', exhaustedToken);
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'invite',
        userId: 'guest',
        inviteToken: { tokenId: 'tok-1234', tokenValue: 'secret-token-value' },
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('exhausted');
      expect(response.message).toContain('no remaining uses');
    });

    it('invalid token hash -> auth_error invalid_token', async () => {
      const token = createInviteToken({
        tokenHash: 'hash:different-secret', // Hash of different value
      });
      platform._inviteTokens.set('plan-abc:tok-1234', token);
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'invite',
        userId: 'guest',
        inviteToken: { tokenId: 'tok-1234', tokenValue: 'wrong-secret-value' },
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('invalid_token');
      expect(response.message).toContain('Invalid invite token value');
    });

    it('non-existent token -> auth_error invalid_token', async () => {
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'invite',
        userId: 'guest',
        inviteToken: { tokenId: 'non-existent', tokenValue: 'secret' },
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('invalid_token');
      expect(response.message).toContain('not found');
    });

    it('valid invite increments useCount', async () => {
      const token = createInviteToken({
        maxUses: 5,
        useCount: 2,
      });
      platform._inviteTokens.set('plan-abc:tok-1234', token);
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'invite',
        userId: 'guest',
        inviteToken: { tokenId: 'tok-1234', tokenValue: 'secret-token-value' },
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthenticatedResponse;
      expect(response.type).toBe('authenticated');

      /** Verify useCount was incremented */
      const updatedToken = platform._inviteTokens.get('plan-abc:tok-1234');
      expect(updatedToken?.useCount).toBe(3);
    });

    it('valid invite records redemption', async () => {
      const token = createInviteToken();
      platform._inviteTokens.set('plan-abc:tok-1234', token);
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'invite',
        userId: 'guest-user',
        inviteToken: { tokenId: 'tok-1234', tokenValue: 'secret-token-value' },
      };
      await handleAuthenticate(platform, ws, authMsg);

      /** Verify redemption was recorded */
      const redemption = platform._inviteRedemptions.get('plan-abc:tok-1234:guest-user');
      expect(redemption).toBeDefined();
      expect(redemption?.redeemedBy).toBe('guest-user');
      expect(redemption?.tokenId).toBe('tok-1234');
    });
  });

  describe('flow integrity', () => {
    it('authenticate without pending subscribe -> error no_pending_subscription', async () => {
      platform._gitHubTokens.set('valid-token', 'alice');
      /** No pending subscription */

      const authMsg: AuthenticateMessage = {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'valid-token',
      };
      await handleAuthenticate(platform, ws, authMsg);

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('no_pending_subscription');
    });

    it('publish before authenticate -> blocked (no relay)', async () => {
      /** Subscribe but don't authenticate */
      const subscribeMsg: SubscribeMessage = {
        type: 'subscribe',
        topics: ['shipyard-plan-abc'],
      };
      handleSubscribe(platform, ws, subscribeMsg);

      /** Another user is subscribed and authenticated */
      const ws2 = createMockWebSocket('ws-2');
      platform._activeSubscriptions.set(ws2, new Set(['shipyard-plan-abc']));
      platform._topicSubscribers.set('shipyard-plan-abc', new Set([ws2]));

      /** Try to publish without authentication */
      const publishMsg: PublishMessage = {
        type: 'publish',
        topic: 'shipyard-plan-abc',
        signal: { type: 'offer' },
      };
      handlePublish(platform, ws, publishMsg);

      /** ws2 should NOT receive the message (publish was blocked) */
      const ws2Messages = getAllMessages(platform, ws2);
      expect(ws2Messages.length).toBe(0);
    });

    it('publish after authenticate -> relayed to subscribers', async () => {
      platform._gitHubTokens.set('alice-token', 'alice');

      /** Subscribe and authenticate */
      handleSubscribe(platform, ws, { type: 'subscribe', topics: ['shipyard-plan-abc'] });
      await handleAuthenticate(platform, ws, {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'alice-token',
      });

      /** Another authenticated user */
      const ws2 = createMockWebSocket('ws-2');
      platform._activeSubscriptions.set(ws2, new Set(['shipyard-plan-abc']));
      platform._topicSubscribers.get('shipyard-plan-abc')?.add(ws2);

      /** Publish after authentication */
      const publishMsg: PublishMessage = {
        type: 'publish',
        topic: 'shipyard-plan-abc',
        signal: { type: 'offer' },
      };
      handlePublish(platform, ws, publishMsg);

      /** ws2 should receive the message */
      const ws2Messages = getAllMessages(platform, ws2);
      expect(ws2Messages.length).toBe(1);
      expect((ws2Messages[0] as PublishMessage).signal).toEqual({ type: 'offer' });
    });

    it('multiple pending topics -> all activated on auth', async () => {
      platform._gitHubTokens.set('alice-token', 'alice');

      /** Subscribe to multiple topics */
      handleSubscribe(platform, ws, {
        type: 'subscribe',
        topics: ['shipyard-plan-abc', 'some-other-topic', 'shipyard-plan-def'],
      });

      /** Verify all are pending */
      expect(platform.isSubscriptionPending(ws, 'shipyard-plan-abc')).toBe(true);
      expect(platform.isSubscriptionPending(ws, 'some-other-topic')).toBe(true);
      expect(platform.isSubscriptionPending(ws, 'shipyard-plan-def')).toBe(true);

      /** Authenticate (will use first shipyard-* topic for plan validation) */
      await handleAuthenticate(platform, ws, {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'alice-token',
      });

      /** All topics should now be active */
      expect(platform.isSubscriptionActive(ws, 'shipyard-plan-abc')).toBe(true);
      expect(platform.isSubscriptionActive(ws, 'some-other-topic')).toBe(true);
      expect(platform.isSubscriptionActive(ws, 'shipyard-plan-def')).toBe(true);

      /** None should be pending */
      expect(platform.isSubscriptionPending(ws, 'shipyard-plan-abc')).toBe(false);
      expect(platform.isSubscriptionPending(ws, 'some-other-topic')).toBe(false);
      expect(platform.isSubscriptionPending(ws, 'shipyard-plan-def')).toBe(false);
    });

    it('auth clears auth deadline', async () => {
      platform._gitHubTokens.set('alice-token', 'alice');

      /** Subscribe (sets deadline) */
      handleSubscribe(platform, ws, { type: 'subscribe', topics: ['shipyard-plan-abc'] });
      expect(platform.getAuthDeadline(ws)).not.toBeNull();

      /** Authenticate (clears deadline) */
      await handleAuthenticate(platform, ws, {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'alice-token',
      });

      expect(platform.getAuthDeadline(ws)).toBeNull();
    });

    it('auth sets connection userId', async () => {
      platform._gitHubTokens.set('alice-token', 'alice');
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      expect(platform.getConnectionUserId(ws)).toBeNull();

      await handleAuthenticate(platform, ws, {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'alice-token',
      });

      expect(platform.getConnectionUserId(ws)).toBe('alice');
    });
  });

  describe('message validation', () => {
    it('invalid message format -> auth_error invalid_token', async () => {
      platform.addPendingSubscription(ws, 'shipyard-plan-abc');

      /** Missing required fields */
      await handleAuthenticate(platform, ws, { type: 'authenticate' });

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('invalid_token');
      expect(response.message).toContain('Invalid');
    });

    it('non-plan topic only -> error no_pending_subscription (no plan found)', async () => {
      platform._gitHubTokens.set('alice-token', 'alice');
      platform.addPendingSubscription(ws, 'non-shipyard-topic');

      await handleAuthenticate(platform, ws, {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'alice-token',
      });

      const response = getLastMessage(platform, ws) as AuthErrorResponse;
      expect(response.type).toBe('auth_error');
      expect(response.error).toBe('no_pending_subscription');
      expect(response.message).toContain('No plan subscription pending');
    });
  });

  describe('timeout behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('subscribe without authenticate should timeout at 10s', () => {
      const mockClose = vi.fn();

      /** Subscribe without auth */
      handleSubscribe(platform, ws, {
        type: 'subscribe',
        topics: ['shipyard-plan-123'],
      });

      /** Verify deadline was set */
      expect(platform.getAuthDeadline(ws)).not.toBeNull();

      /** Fast-forward time past the deadline (11 seconds) */
      vi.advanceTimersByTime(11000);

      /** Run timeout checker */
      const disconnected = checkAuthDeadlines(platform, mockClose);

      /** Verify connection was closed with timeout error */
      expect(disconnected).toBe(1);
      expect(mockClose).toHaveBeenCalledWith(ws);

      /** Verify timeout error message was sent */
      const messages = getAllMessages(platform, ws);
      const timeoutMessage = messages.find(
        (m) => (m as AuthErrorResponse).type === 'auth_error' && (m as AuthErrorResponse).error === 'timeout'
      );
      expect(timeoutMessage).toBeDefined();
      expect((timeoutMessage as AuthErrorResponse).message).toContain('timeout');
    });

    it('auth received before deadline -> no timeout', async () => {
      const mockClose = vi.fn();
      platform._gitHubTokens.set('valid-token', 'alice');

      /** Subscribe (sets deadline) */
      handleSubscribe(platform, ws, {
        type: 'subscribe',
        topics: ['shipyard-plan-123'],
      });

      /** Verify deadline was set */
      expect(platform.getAuthDeadline(ws)).not.toBeNull();

      /** Authenticate before deadline (5 seconds in) */
      vi.advanceTimersByTime(5000);

      await handleAuthenticate(platform, ws, {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'valid-token',
      });

      /** Deadline should be cleared after successful auth */
      expect(platform.getAuthDeadline(ws)).toBeNull();

      /** Advance time past original deadline */
      vi.advanceTimersByTime(6000);

      /** Run timeout checker */
      const disconnected = checkAuthDeadlines(platform, mockClose);

      /** No connections should be disconnected */
      expect(disconnected).toBe(0);
      expect(mockClose).not.toHaveBeenCalled();
    });

    it('multiple connections, only expired ones disconnected', () => {
      const mockClose = vi.fn();
      const ws2 = createMockWebSocket('ws-2');
      const ws3 = createMockWebSocket('ws-3');

      /** ws1: Subscribe at time 0 */
      handleSubscribe(platform, ws, {
        type: 'subscribe',
        topics: ['shipyard-plan-123'],
      });

      /** Advance 3 seconds */
      vi.advanceTimersByTime(3000);

      /** ws2: Subscribe at time 3s */
      handleSubscribe(platform, ws2, {
        type: 'subscribe',
        topics: ['shipyard-plan-456'],
      });

      /** Advance 5 seconds (now at 8s total) */
      vi.advanceTimersByTime(5000);

      /** ws3: Subscribe at time 8s */
      handleSubscribe(platform, ws3, {
        type: 'subscribe',
        topics: ['shipyard-plan-789'],
      });

      /** Advance 3 more seconds (now at 11s total) */
      vi.advanceTimersByTime(3000);

      /** At 11s: ws1 deadline expired (10s), ws2 not expired (13s), ws3 not expired (18s) */
      const disconnected = checkAuthDeadlines(platform, mockClose);

      expect(disconnected).toBe(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledWith(ws);

      /** Advance 3 more seconds (now at 14s total) */
      vi.advanceTimersByTime(3000);

      /** At 14s: ws2 deadline expired (13s), ws3 not expired (18s) */
      const disconnected2 = checkAuthDeadlines(platform, mockClose);

      expect(disconnected2).toBe(1);
      expect(mockClose).toHaveBeenCalledTimes(2);
      expect(mockClose).toHaveBeenCalledWith(ws2);
    });

    it('deadline cleared after successful auth', async () => {
      platform._gitHubTokens.set('valid-token', 'alice');

      /** Subscribe (sets deadline) */
      handleSubscribe(platform, ws, {
        type: 'subscribe',
        topics: ['shipyard-plan-123'],
      });

      /** Deadline should be set */
      expect(platform.getAuthDeadline(ws)).not.toBeNull();
      expect(platform.getAllConnectionsWithDeadlines().length).toBe(1);

      /** Authenticate */
      await handleAuthenticate(platform, ws, {
        type: 'authenticate',
        auth: 'owner',
        userId: 'alice',
        githubToken: 'valid-token',
      });

      /** Deadline should be cleared */
      expect(platform.getAuthDeadline(ws)).toBeNull();
      expect(platform.getAllConnectionsWithDeadlines().length).toBe(0);
    });
  });
});
