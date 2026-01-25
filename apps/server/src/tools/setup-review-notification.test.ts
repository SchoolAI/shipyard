import { describe, expect, it } from 'vitest';
import { setupReviewNotificationTool } from './setup-review-notification.js';

describe('setupReviewNotification', () => {
  describe('script generation', () => {
    it('should generate script with correct registry port', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-plan-123',
        pollIntervalSeconds: 15,
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('TRPC_URL="http://localhost:32191/trpc"');
      expect(text).toContain('PLAN_ID="test-plan-123"');
      expect(text).toContain('POLL_INTERVAL=15');
    });

    it('should use default poll interval of 30 seconds', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-plan-abc',
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('POLL_INTERVAL=30');
    });

    it('should include jq dependency check', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-plan-123',
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('command -v jq');
      expect(text).toContain('brew install jq');
      expect(text).toContain('apt install jq');
    });

    it('should check for empty CLIENT_ID', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-plan-123',
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('if [ -z "$CLIENT_ID" ]; then');
      expect(text).toContain('Is the Shipyard registry server running?');
    });
  });

  describe('tRPC format', () => {
    it('should use correct mutation format (no json wrapper)', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-123',
      });

      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain('POST "$TRPC_URL/subscription.create"');
      expect(text).toContain('"subscribe":["status","comments"]');
      expect(text).toContain('"windowMs":5000');
      expect(text).toContain('"threshold":1');

      expect(text).not.toContain('{"json":{"planId"');
    });

    it('should use correct query format (GET with url-encoded input)', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-123',
      });

      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain('curl -sf "$TRPC_URL/subscription.getChanges?input=$ENCODED_INPUT"');
      expect(text).toContain('jq -sRr @uri');
      expect(text).toContain('INPUT=');

      expect(text).not.toContain('POST "$TRPC_URL/subscription.getChanges"');
    });
  });

  describe('status detection', () => {
    it('should exit on in_progress status (approved)', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-123',
      });

      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain('grep -qE "Status:.*(in_progress|changes_requested)"');
    });

    it('should exit on changes_requested status', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-123',
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('changes_requested');
    });

    it('should use enum values from PlanStatusValues', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-123',
      });

      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain('in_progress');
      expect(text).toContain('changes_requested');

      expect(text).toMatch(/grep -qE "Status:\.\*\(in_progress\|changes_requested\)"/);
    });
  });

  describe('response parsing', () => {
    it('should extract clientId from tRPC response format', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-123',
      });

      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain('sed -n \'s/.*"clientId":"\\([^"]*\\)".*/\\1/p\'');
    });

    it('should extract changes from tRPC response format', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-123',
      });

      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain('grep -q \'"ready":true\'');
      expect(text).toContain('sed -n \'s/.*"changes":"\\([^"]*\\)".*/\\1/p\'');
    });
  });

  describe('documentation', () => {
    it('should mention jq requirement', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-123',
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Requires `jq`');
      expect(text).toContain('brew install jq');
    });

    it('should explain usage', async () => {
      const result = await setupReviewNotificationTool.handler({
        planId: 'test-123',
      });

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('bash script.sh &');
    });
  });
});
