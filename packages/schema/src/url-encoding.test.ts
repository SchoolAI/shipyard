import { describe, expect, it } from 'vitest';
import type { UrlEncodedPlan } from './url-encoding.js';
import { createPlanUrl, decodePlan, encodePlan } from './url-encoding.js';

describe('URL Encoding', () => {
  const samplePlan: UrlEncodedPlan = {
    v: 1,
    id: 'plan-abc123',
    title: 'Add User Authentication',
    status: 'draft',
    repo: 'org/repo',
    pr: 42,
    content: [
      {
        id: 'block-1',
        type: 'paragraph',
        content: [{ type: 'text', text: 'Create auth middleware', styles: {} }],
        children: [],
        props: {
          backgroundColor: 'default',
          textColor: 'default',
          textAlignment: 'left',
        },
      },
    ],
    artifacts: [
      {
        id: 'art-1',
        type: 'screenshot',
        filename: 'login-ui.png',
      },
    ],
  };

  describe('encodePlan / decodePlan', () => {
    it('round-trips correctly', () => {
      const encoded = encodePlan(samplePlan);
      const decoded = decodePlan(encoded);

      expect(decoded).toEqual(samplePlan);
    });

    it('handles unicode characters', () => {
      const planWithUnicode: UrlEncodedPlan = {
        ...samplePlan,
        title: '添加用户认证 🔐',
        content: [
          {
            id: 'block-1',
            type: 'paragraph',
            content: [{ type: 'text', text: 'Créer middleware 日本語', styles: {} }],
            children: [],
            props: {
              backgroundColor: 'default',
              textColor: 'default',
              textAlignment: 'left',
            },
          },
        ],
      };

      const encoded = encodePlan(planWithUnicode);
      const decoded = decodePlan(encoded);

      expect(decoded).toEqual(planWithUnicode);
    });

    it('handles special characters', () => {
      const planWithSpecial: UrlEncodedPlan = {
        ...samplePlan,
        title: 'Fix "bug" & <issues> with \'quotes\'',
      };

      const encoded = encodePlan(planWithSpecial);
      const decoded = decodePlan(encoded);

      expect(decoded).toEqual(planWithSpecial);
    });

    it('returns null for invalid encoded string', () => {
      expect(decodePlan('invalid-data')).toBeNull();
      expect(decodePlan('')).toBeNull();
      expect(decodePlan('not-base64-!@#$')).toBeNull();
    });

    it('handles empty content', () => {
      const emptyPlan: UrlEncodedPlan = {
        v: 1,
        id: 'plan-empty',
        title: 'Empty Plan',
        status: 'draft',
        content: [],
      };

      const encoded = encodePlan(emptyPlan);
      const decoded = decodePlan(encoded);

      expect(decoded).toEqual(emptyPlan);
    });
  });

  describe('createPlanUrl', () => {
    it('creates valid URL with encoded data', () => {
      const baseUrl = 'https://example.com/plan';
      const url = createPlanUrl(baseUrl, samplePlan);

      expect(url).toContain('https://example.com/plan?d=');

      const urlObj = new URL(url);
      const encoded = urlObj.searchParams.get('d');
      expect(encoded).toBeTruthy();

      if (!encoded) throw new Error('Encoding failed');
      const decoded = decodePlan(encoded);
      expect(decoded).toEqual(samplePlan);
    });

    it('handles base URLs with existing params', () => {
      const baseUrl = 'https://example.com/plan?foo=bar';
      const url = createPlanUrl(baseUrl, samplePlan);

      const urlObj = new URL(url);
      expect(urlObj.searchParams.get('foo')).toBe('bar');
      expect(urlObj.searchParams.get('d')).toBeTruthy();
    });
  });

  describe('compression efficiency', () => {
    it('achieves reasonable compression', () => {
      const largePlan: UrlEncodedPlan = {
        v: 1,
        id: 'plan-large',
        title: 'Large Implementation Plan',
        status: 'pending_review',
        content: Array.from({ length: 10 }, (_, i) => ({
          id: `block-${i}`,
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `Step ${i + 1}: This is a longer description with implementation details that explains what needs to be done.`,
              styles: {},
            },
          ],
          children: [],
          props: {
            backgroundColor: 'default',
            textColor: 'default',
            textAlignment: 'left',
          },
        })),
      };

      const json = JSON.stringify(largePlan);
      const encoded = encodePlan(largePlan);

      
      expect(encoded.length).toBeLessThan(json.length);

      expect(encoded.length).toBeLessThan(2000);
    });
  });

  describe('version handling', () => {
    it('handles unknown versions gracefully', () => {
      const futureVersionPlan = { ...samplePlan, v: 99 as 1 };
      const encoded = encodePlan(futureVersionPlan);
      const decoded = decodePlan(encoded);

      
      expect(decoded).toBeTruthy();
      expect(decoded?.id).toBe(samplePlan.id);
    });
  });
});
