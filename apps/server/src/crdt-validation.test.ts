/**
 * Tests for CRDT validation module.
 * Verifies that corruption from malicious peers is detected.
 */

import { YDOC_KEYS } from '@shipyard/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  attachCRDTValidation,
  detachCRDTValidation,
  getCorruptedKeys,
  isPlanCorrupted,
  validateYDoc,
} from './crdt-validation.js';

// Mock the logger to capture error logs
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CRDT Validation', () => {
  let doc: Y.Doc;
  const planId = 'test-plan-123';

  beforeEach(() => {
    doc = new Y.Doc();
    // Initialize with valid metadata
    const metadata = doc.getMap(YDOC_KEYS.METADATA);
    metadata.set('id', planId);
    metadata.set('title', 'Test Plan');
    metadata.set('status', 'draft');
    metadata.set('createdAt', Date.now());
    metadata.set('updatedAt', Date.now());
  });

  afterEach(() => {
    detachCRDTValidation(planId);
    doc.destroy();
  });

  describe('validateYDoc', () => {
    it('should return valid report for empty Y.Doc arrays', () => {
      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(false);
      expect(report.planId).toBe(planId);
      expect(report.results).toHaveLength(8); // metadata + 7 arrays
      expect(report.results.every((r) => r.valid)).toBe(true);
    });

    it('should detect invalid metadata status', () => {
      const metadata = doc.getMap(YDOC_KEYS.METADATA);
      metadata.set('status', 'invalid-status');

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
      const metadataResult = report.results.find((r) => r.key === YDOC_KEYS.METADATA);
      expect(metadataResult?.valid).toBe(false);
      expect(metadataResult?.errors?.[0]).toContain('Invalid');
    });

    it('should detect invalid artifact in array', () => {
      const artifacts = doc.getArray(YDOC_KEYS.ARTIFACTS);
      // Push invalid artifact (missing required fields)
      artifacts.push([{ id: '123', type: 'image' }]); // Missing storage, filename

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
      const artifactsResult = report.results.find((r) => r.key === YDOC_KEYS.ARTIFACTS);
      expect(artifactsResult?.valid).toBe(false);
      expect(artifactsResult?.invalidItems).toBe(1);
      expect(artifactsResult?.totalItems).toBe(1);
    });

    it('should pass for valid artifact', () => {
      const artifacts = doc.getArray(YDOC_KEYS.ARTIFACTS);
      artifacts.push([
        {
          id: 'art-123',
          type: 'image',
          filename: 'test.png',
          storage: 'github',
          url: 'https://example.com/test.png',
        },
      ]);

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(false);
      const artifactsResult = report.results.find((r) => r.key === YDOC_KEYS.ARTIFACTS);
      expect(artifactsResult?.valid).toBe(true);
      expect(artifactsResult?.invalidItems).toBe(0);
      expect(artifactsResult?.totalItems).toBe(1);
    });

    it('should detect invalid linked PR', () => {
      const linkedPRs = doc.getArray(YDOC_KEYS.LINKED_PRS);
      // Push invalid PR (missing required fields)
      linkedPRs.push([{ prNumber: 42 }]); // Missing url, linkedAt, status

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
      const prsResult = report.results.find((r) => r.key === YDOC_KEYS.LINKED_PRS);
      expect(prsResult?.valid).toBe(false);
    });

    it('should detect invalid deliverable', () => {
      const deliverables = doc.getArray(YDOC_KEYS.DELIVERABLES);
      // Push invalid deliverable (missing required text field)
      deliverables.push([{ id: 'del-1' }]); // Missing text

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
      const delResult = report.results.find((r) => r.key === YDOC_KEYS.DELIVERABLES);
      expect(delResult?.valid).toBe(false);
    });

    it('should detect invalid plan event', () => {
      const events = doc.getArray(YDOC_KEYS.EVENTS);
      // Push invalid event (invalid type)
      events.push([
        {
          id: 'evt-1',
          type: 'invalid_event_type',
          actor: 'test',
          timestamp: Date.now(),
        },
      ]);

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
      const eventsResult = report.results.find((r) => r.key === YDOC_KEYS.EVENTS);
      expect(eventsResult?.valid).toBe(false);
    });

    it('should detect invalid input request', () => {
      const inputRequests = doc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      // Push invalid input request (choice type without options)
      inputRequests.push([
        {
          id: 'req-1',
          type: 'choice',
          message: 'Choose one',
          status: 'pending',
          createdAt: Date.now(),
          // Missing required 'options' for choice type
        },
      ]);

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
      const requestsResult = report.results.find((r) => r.key === YDOC_KEYS.INPUT_REQUESTS);
      expect(requestsResult?.valid).toBe(false);
    });

    it('should detect mixed valid and invalid items', () => {
      const artifacts = doc.getArray(YDOC_KEYS.ARTIFACTS);
      // Push one valid and one invalid
      artifacts.push([
        {
          id: 'art-1',
          type: 'image',
          filename: 'valid.png',
          storage: 'github',
          url: 'https://example.com/valid.png',
        },
        { id: 'art-2', type: 'image' }, // Invalid - missing fields
      ]);

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
      const artifactsResult = report.results.find((r) => r.key === YDOC_KEYS.ARTIFACTS);
      expect(artifactsResult?.valid).toBe(false);
      expect(artifactsResult?.totalItems).toBe(2);
      expect(artifactsResult?.invalidItems).toBe(1);
    });
  });

  describe('attachCRDTValidation', () => {
    it('should track corruption state when invalid data is added', () => {
      attachCRDTValidation(planId, doc);

      // Initially not corrupted
      expect(isPlanCorrupted(planId)).toBe(false);
      expect(getCorruptedKeys(planId)).toEqual([]);

      // Add invalid artifact
      const artifacts = doc.getArray(YDOC_KEYS.ARTIFACTS);
      artifacts.push([{ id: 'bad', type: 'image' }]); // Invalid

      // Now corrupted
      expect(isPlanCorrupted(planId)).toBe(true);
      expect(getCorruptedKeys(planId)).toContain(YDOC_KEYS.ARTIFACTS);
    });

    it('should clear corruption state when data becomes valid', () => {
      attachCRDTValidation(planId, doc);

      // Add invalid artifact
      const artifacts = doc.getArray(YDOC_KEYS.ARTIFACTS);
      artifacts.push([{ id: 'bad', type: 'image' }]);

      expect(isPlanCorrupted(planId)).toBe(true);

      // Remove invalid and add valid
      artifacts.delete(0, 1);
      artifacts.push([
        {
          id: 'good',
          type: 'image',
          filename: 'test.png',
          storage: 'github',
          url: 'https://example.com/test.png',
        },
      ]);

      // Should be cleared
      expect(isPlanCorrupted(planId)).toBe(false);
    });

    it('should detect metadata corruption', () => {
      attachCRDTValidation(planId, doc);

      expect(isPlanCorrupted(planId)).toBe(false);

      // Corrupt metadata with invalid status
      const metadata = doc.getMap(YDOC_KEYS.METADATA);
      metadata.set('status', 'hacked-status');

      expect(isPlanCorrupted(planId)).toBe(true);
      expect(getCorruptedKeys(planId)).toContain(YDOC_KEYS.METADATA);
    });

    it('should validate multiple arrays independently', () => {
      attachCRDTValidation(planId, doc);

      // Corrupt artifacts
      const artifacts = doc.getArray(YDOC_KEYS.ARTIFACTS);
      artifacts.push([{ id: 'bad' }]);

      // Corrupt deliverables
      const deliverables = doc.getArray(YDOC_KEYS.DELIVERABLES);
      deliverables.push([{ id: 'bad' }]);

      // Both should be flagged
      const corruptedKeys = getCorruptedKeys(planId);
      expect(corruptedKeys).toContain(YDOC_KEYS.ARTIFACTS);
      expect(corruptedKeys).toContain(YDOC_KEYS.DELIVERABLES);
    });
  });

  describe('detachCRDTValidation', () => {
    it('should clear all corruption state', () => {
      attachCRDTValidation(planId, doc);

      // Add some corruption
      const artifacts = doc.getArray(YDOC_KEYS.ARTIFACTS);
      artifacts.push([{ id: 'bad' }]);

      expect(isPlanCorrupted(planId)).toBe(true);

      // Detach
      detachCRDTValidation(planId);

      // State should be cleared
      expect(isPlanCorrupted(planId)).toBe(false);
      expect(getCorruptedKeys(planId)).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty metadata', () => {
      const emptyDoc = new Y.Doc();
      const report = validateYDoc(emptyDoc, 'empty-plan');

      expect(report.isCorrupted).toBe(true);
      const metadataResult = report.results.find((r) => r.key === YDOC_KEYS.METADATA);
      expect(metadataResult?.valid).toBe(false);
      expect(metadataResult?.errors?.[0]).toContain('No metadata');

      emptyDoc.destroy();
    });

    it('should handle null items in arrays gracefully', () => {
      const artifacts = doc.getArray(YDOC_KEYS.ARTIFACTS);
      // Push null (this shouldn't happen in practice, but testing resilience)
      artifacts.push([null as unknown as object]);

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
      const artifactsResult = report.results.find((r) => r.key === YDOC_KEYS.ARTIFACTS);
      expect(artifactsResult?.valid).toBe(false);
    });

    it('should validate pending_review status requires reviewRequestId', () => {
      const metadata = doc.getMap(YDOC_KEYS.METADATA);
      metadata.set('status', 'pending_review');
      // Missing reviewRequestId

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
      const metadataResult = report.results.find((r) => r.key === YDOC_KEYS.METADATA);
      expect(metadataResult?.valid).toBe(false);
    });

    it('should pass for valid pending_review with reviewRequestId', () => {
      const metadata = doc.getMap(YDOC_KEYS.METADATA);
      metadata.set('status', 'pending_review');
      metadata.set('reviewRequestId', 'req-123');

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(false);
    });

    it('should validate in_progress status requires review fields', () => {
      const metadata = doc.getMap(YDOC_KEYS.METADATA);
      metadata.set('status', 'in_progress');
      // Missing reviewedAt and reviewedBy

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(true);
    });

    it('should pass for valid in_progress with review fields', () => {
      const metadata = doc.getMap(YDOC_KEYS.METADATA);
      metadata.set('status', 'in_progress');
      metadata.set('reviewedAt', Date.now());
      metadata.set('reviewedBy', 'reviewer');

      const report = validateYDoc(doc, planId);

      expect(report.isCorrupted).toBe(false);
    });
  });
});
