/**
 * Tests for type-safe factory functions that create discriminated union objects.
 * These factories prevent validation errors by ensuring all required fields are present.
 */

import { describe, expect, it } from 'vitest';
import {
  ArtifactSchema,
  ConversationVersionSchema,
  createGitHubArtifact,
  createHandedOffConversationVersion,
  createInitialConversationVersion,
  createLinkedPR,
  createLocalArtifact,
  LinkedPRSchema,
} from './plan.js';

describe('Factory Functions', () => {
  describe('createInitialConversationVersion', () => {
    it('creates valid ConversationVersion with handedOff: false', () => {
      const version = createInitialConversationVersion({
        versionId: 'test-id',
        creator: 'test-user',
        platform: 'claude-code',
        sessionId: 'session-1',
        messageCount: 0,
        createdAt: Date.now(),
      });

      expect(version.handedOff).toBe(false);
      expect(ConversationVersionSchema.safeParse(version).success).toBe(true);
    });

    it('enforces required fields at compile time', () => {
      const version = createInitialConversationVersion({
        versionId: 'test-id',
        creator: 'test-user',
        platform: 'claude-code',
        sessionId: 'session-1',
        messageCount: 5,
        createdAt: 1234567890,
      });

      expect(version).toMatchObject({
        versionId: 'test-id',
        creator: 'test-user',
        platform: 'claude-code',
        sessionId: 'session-1',
        messageCount: 5,
        createdAt: 1234567890,
        handedOff: false,
      });
    });

    it('validates data at runtime with .parse()', () => {
      expect(() =>
        createInitialConversationVersion({
          versionId: 'test-id',
          creator: 'test-user',
          platform: 'claude-code',
          sessionId: 'session-1',
          messageCount: 5,
          createdAt: 1234567890,
        })
      ).not.toThrow();

      expect(() =>
        createInitialConversationVersion({
          versionId: 'test-id',
          creator: 'test-user',
          platform: 'claude-code',
          sessionId: 'session-1',
          messageCount: 'invalid' as any,
          createdAt: 1234567890,
        })
      ).toThrow();
    });
  });

  describe('createHandedOffConversationVersion', () => {
    it('creates valid ConversationVersion with handedOff: true', () => {
      const version = createHandedOffConversationVersion({
        versionId: 'test-id',
        creator: 'test-user',
        platform: 'claude-code',
        sessionId: 'session-1',
        messageCount: 10,
        createdAt: Date.now(),
        handedOffAt: Date.now(),
        handedOffTo: 'other-user',
      });

      expect(version.handedOff).toBe(true);
      if (version.handedOff) {
        expect(version.handedOffTo).toBe('other-user');
        expect(typeof version.handedOffAt).toBe('number');
      }
      expect(ConversationVersionSchema.safeParse(version).success).toBe(true);
    });

    it('validates data at runtime with .parse()', () => {
      expect(() =>
        createHandedOffConversationVersion({
          versionId: 'test-id',
          creator: 'test-user',
          platform: 'claude-code',
          sessionId: 'session-1',
          messageCount: 10,
          createdAt: 1234567890,
          handedOffAt: 1234567900,
          handedOffTo: 'other-user',
        })
      ).not.toThrow();

      expect(() =>
        createHandedOffConversationVersion({
          versionId: 'test-id',
          creator: 'test-user',
          platform: 'claude-code',
          sessionId: 'session-1',
          messageCount: 10,
          createdAt: 1234567890,
          handedOffAt: 'invalid' as any,
          handedOffTo: 'other-user',
        })
      ).toThrow();
    });
  });

  describe('createGitHubArtifact', () => {
    it('creates valid GitHubArtifact with storage: github', () => {
      const artifact = createGitHubArtifact({
        type: 'screenshot',
        filename: 'screenshot.png',
        url: 'https://example.com/screenshot.png',
        description: 'Login page',
      });

      expect(artifact.storage).toBe('github');
      expect(artifact.url).toBe('https://example.com/screenshot.png');
      expect(artifact.uploadedAt).toBeDefined();
      expect(ArtifactSchema.safeParse(artifact).success).toBe(true);
    });

    it('uses provided uploadedAt if given', () => {
      const uploadedAt = 1234567890;
      const artifact = createGitHubArtifact({
        type: 'video',
        filename: 'demo.mp4',
        url: 'https://example.com/demo.mp4',
        uploadedAt,
      });

      expect(artifact.uploadedAt).toBe(uploadedAt);
    });

    it('defaults uploadedAt to current time if not provided', () => {
      const before = Date.now();
      const artifact = createGitHubArtifact({
        type: 'test_results',
        filename: 'results.json',
        url: 'https://example.com/results.json',
      });
      const after = Date.now();

      expect(artifact.uploadedAt).toBeGreaterThanOrEqual(before);
      expect(artifact.uploadedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('createLocalArtifact', () => {
    it('creates valid LocalArtifact with storage: local', () => {
      const artifact = createLocalArtifact({
        type: 'screenshot',
        filename: 'screenshot.png',
        localArtifactId: 'local-123',
        description: 'Dashboard',
      });

      expect(artifact.storage).toBe('local');
      expect(artifact.localArtifactId).toBe('local-123');
      expect(artifact.uploadedAt).toBeDefined();
      expect(ArtifactSchema.safeParse(artifact).success).toBe(true);
    });

    it('uses provided uploadedAt if given', () => {
      const uploadedAt = 1234567890;
      const artifact = createLocalArtifact({
        type: 'diff',
        filename: 'changes.diff',
        localArtifactId: 'local-456',
        uploadedAt,
      });

      expect(artifact.uploadedAt).toBe(uploadedAt);
    });
  });

  describe('createLinkedPR', () => {
    it('creates valid LinkedPR with all required fields', () => {
      const linkedPR = createLinkedPR({
        prNumber: 42,
        url: 'https://github.com/org/repo/pull/42',
        status: 'open',
        branch: 'feature/test',
        title: 'Add new feature',
      });

      expect(linkedPR.prNumber).toBe(42);
      expect(linkedPR.linkedAt).toBeDefined();
      expect(LinkedPRSchema.safeParse(linkedPR).success).toBe(true);
    });

    it('uses provided linkedAt if given', () => {
      const linkedAt = 1234567890;
      const linkedPR = createLinkedPR({
        prNumber: 42,
        url: 'https://github.com/org/repo/pull/42',
        status: 'merged',
        branch: 'feature/test',
        title: 'Add new feature',
        linkedAt,
      });

      expect(linkedPR.linkedAt).toBe(linkedAt);
    });

    it('defaults linkedAt to current time if not provided', () => {
      const before = Date.now();
      const linkedPR = createLinkedPR({
        prNumber: 42,
        url: 'https://github.com/org/repo/pull/42',
        status: 'draft',
        branch: 'feature/test',
        title: 'Add new feature',
      });
      const after = Date.now();

      expect(linkedPR.linkedAt).toBeGreaterThanOrEqual(before);
      expect(linkedPR.linkedAt).toBeLessThanOrEqual(after);
    });

    it('handles all PR statuses', () => {
      const statuses = ['draft', 'open', 'merged', 'closed'] as const;

      for (const status of statuses) {
        const linkedPR = createLinkedPR({
          prNumber: 1,
          url: 'https://github.com/org/repo/pull/1',
          status,
          branch: 'feature/test',
          title: 'Test PR',
        });

        expect(linkedPR.status).toBe(status);
        expect(LinkedPRSchema.safeParse(linkedPR).success).toBe(true);
      }
    });

    it('handles optional fields correctly', () => {
      const withOptional = createLinkedPR({
        prNumber: 42,
        url: 'https://github.com/org/repo/pull/42',
        status: 'open',
        branch: 'feature/test',
        title: 'Test PR',
      });

      expect(withOptional.branch).toBe('feature/test');
      expect(withOptional.title).toBe('Test PR');

      const withoutOptional = createLinkedPR({
        prNumber: 42,
        url: 'https://github.com/org/repo/pull/42',
        status: 'open',
        branch: 'main',
        title: 'PR Title',
      });

      expect(withoutOptional.branch).toBe('main');
      expect(withoutOptional.title).toBe('PR Title');
    });
  });
});
