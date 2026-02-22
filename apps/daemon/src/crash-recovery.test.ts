import { createTypedDoc } from '@loro-extended/change';
import type { TaskDocHandles } from '@shipyard/loro-schema';
import {
  generateTaskId,
  TaskConversationDocumentSchema,
  TaskMetaDocumentSchema,
  TaskReviewDocumentSchema,
} from '@shipyard/loro-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrashRecoveryLogger } from './crash-recovery.js';
import { recoverOrphanedTask } from './crash-recovery.js';
import { SessionManager } from './session-manager.js';

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

function createTaskDocHandles(): TaskDocHandles {
  return {
    meta: createTypedDoc(TaskMetaDocumentSchema),
    conv: createTypedDoc(TaskConversationDocumentSchema),
    review: createTypedDoc(TaskReviewDocumentSchema),
  };
}

describe('recoverOrphanedTask', () => {
  let taskDocs: TaskDocHandles;
  let mockLog: CrashRecoveryLogger;
  const taskId = generateTaskId();
  const now = Date.now();

  beforeEach(() => {
    vi.clearAllMocks();

    taskDocs = createTaskDocHandles();
    taskDocs.meta.meta.id = taskId;
    taskDocs.meta.meta.title = 'Test task';
    taskDocs.meta.meta.status = 'submitted';
    taskDocs.meta.meta.createdAt = now;
    taskDocs.meta.meta.updatedAt = now;

    mockLog = {
      info: vi.fn(),
    };
  });

  describe('status reset', () => {
    it('resets meta.status from working to failed', () => {
      taskDocs.meta.meta.status = 'working';

      const recovered = recoverOrphanedTask(taskDocs, mockLog);

      expect(recovered).toBe(true);
      expect(taskDocs.meta.toJSON().meta.status).toBe('failed');
    });

    it('resets meta.status from starting to failed', () => {
      taskDocs.meta.meta.status = 'starting';

      const recovered = recoverOrphanedTask(taskDocs, mockLog);

      expect(recovered).toBe(true);
      expect(taskDocs.meta.toJSON().meta.status).toBe('failed');
    });

    it('resets meta.status from input-required to failed', () => {
      taskDocs.meta.meta.status = 'input-required';

      const recovered = recoverOrphanedTask(taskDocs, mockLog);

      expect(recovered).toBe(true);
      expect(taskDocs.meta.toJSON().meta.status).toBe('failed');
    });

    it('updates meta.updatedAt timestamp', () => {
      taskDocs.meta.meta.status = 'working';
      const beforeRecovery = Date.now();

      recoverOrphanedTask(taskDocs, mockLog);

      expect(taskDocs.meta.toJSON().meta.updatedAt).toBeGreaterThanOrEqual(beforeRecovery);
    });
  });

  describe('session marking', () => {
    it('marks last active session as interrupted with error message', () => {
      taskDocs.meta.meta.status = 'working';
      taskDocs.conv.sessions.push({
        sessionId: 'sess-1',
        agentSessionId: 'agent-sess-1',
        status: 'active',
        cwd: '/tmp',
        model: 'claude-opus-4-6',
        machineId: null,
        createdAt: now,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      recoverOrphanedTask(taskDocs, mockLog);

      const json = taskDocs.conv.toJSON();
      expect(json.sessions[0]?.status).toBe('interrupted');
      expect(json.sessions[0]?.error).toBe('Daemon process exited unexpectedly');
    });

    it('marks last pending session as interrupted', () => {
      taskDocs.meta.meta.status = 'starting';
      taskDocs.conv.sessions.push({
        sessionId: 'sess-pending',
        agentSessionId: '',
        status: 'pending',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      recoverOrphanedTask(taskDocs, mockLog);

      const json = taskDocs.conv.toJSON();
      expect(json.sessions[0]?.status).toBe('interrupted');
    });

    it('sets session completedAt timestamp', () => {
      taskDocs.meta.meta.status = 'working';
      taskDocs.conv.sessions.push({
        sessionId: 'sess-1',
        agentSessionId: 'agent-1',
        status: 'active',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      const beforeRecovery = Date.now();
      recoverOrphanedTask(taskDocs, mockLog);

      const json = taskDocs.conv.toJSON();
      expect(json.sessions[0]?.completedAt).toBeGreaterThanOrEqual(beforeRecovery);
    });

    it('only marks the last active/pending session, leaving earlier ones untouched', () => {
      taskDocs.meta.meta.status = 'working';
      taskDocs.conv.sessions.push({
        sessionId: 'sess-old',
        agentSessionId: 'agent-old',
        status: 'completed',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: now + 5000,
        totalCostUsd: 0.01,
        durationMs: 5000,
        error: null,
      });
      taskDocs.conv.sessions.push({
        sessionId: 'sess-current',
        agentSessionId: 'agent-current',
        status: 'active',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now + 6000,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      recoverOrphanedTask(taskDocs, mockLog);

      const json = taskDocs.conv.toJSON();
      expect(json.sessions[0]?.status).toBe('completed');
      expect(json.sessions[1]?.status).toBe('interrupted');
    });
  });

  describe('no-op cases', () => {
    it('does nothing when meta.status is submitted', () => {
      taskDocs.meta.meta.status = 'submitted';

      const recovered = recoverOrphanedTask(taskDocs, mockLog);

      expect(recovered).toBe(false);
      expect(taskDocs.meta.toJSON().meta.status).toBe('submitted');
    });

    it('does nothing when meta.status is completed', () => {
      taskDocs.meta.meta.status = 'completed';

      const recovered = recoverOrphanedTask(taskDocs, mockLog);

      expect(recovered).toBe(false);
      expect(taskDocs.meta.toJSON().meta.status).toBe('completed');
    });

    it('does nothing when meta.status is failed', () => {
      taskDocs.meta.meta.status = 'failed';

      const recovered = recoverOrphanedTask(taskDocs, mockLog);

      expect(recovered).toBe(false);
      expect(taskDocs.meta.toJSON().meta.status).toBe('failed');
    });

    it('does nothing when meta.status is canceled', () => {
      taskDocs.meta.meta.status = 'canceled';

      const recovered = recoverOrphanedTask(taskDocs, mockLog);

      expect(recovered).toBe(false);
      expect(taskDocs.meta.toJSON().meta.status).toBe('canceled');
    });
  });

  describe('edge cases', () => {
    it('handles task with no sessions (resets status only)', () => {
      taskDocs.meta.meta.status = 'working';

      const recovered = recoverOrphanedTask(taskDocs, mockLog);

      expect(recovered).toBe(true);
      expect(taskDocs.meta.toJSON().meta.status).toBe('failed');
      expect(taskDocs.conv.toJSON().sessions).toHaveLength(0);
    });

    it('handles task where all sessions are already completed/failed', () => {
      taskDocs.meta.meta.status = 'working';
      taskDocs.conv.sessions.push({
        sessionId: 'sess-done',
        agentSessionId: 'agent-done',
        status: 'completed',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: now + 5000,
        totalCostUsd: 0.01,
        durationMs: 5000,
        error: null,
      });

      const recovered = recoverOrphanedTask(taskDocs, mockLog);

      expect(recovered).toBe(true);
      expect(taskDocs.meta.toJSON().meta.status).toBe('failed');
      expect(taskDocs.conv.toJSON().sessions[0]?.status).toBe('completed');
    });

    it('logs the previous status for debugging', () => {
      taskDocs.meta.meta.status = 'working';

      recoverOrphanedTask(taskDocs, mockLog);

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({ previousStatus: 'working' }),
        expect.stringContaining('orphaned task')
      );
    });
  });

  describe('integration with shouldResume', () => {
    it('shouldResume returns interrupted session after recovery', () => {
      taskDocs.meta.meta.status = 'working';
      taskDocs.conv.sessions.push({
        sessionId: 'sess-crash',
        agentSessionId: 'agent-sess-crash',
        status: 'active',
        cwd: '/workspace',
        model: 'claude-opus-4-6',
        machineId: 'my-machine',
        createdAt: now,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      recoverOrphanedTask(taskDocs, mockLog);

      const manager = new SessionManager(taskDocs);
      const resumeInfo = manager.shouldResume();

      expect(resumeInfo.resume).toBe(true);
      expect(resumeInfo.sessionId).toBe('sess-crash');
    });

    it('shouldResume skips failed sessions but finds interrupted ones', () => {
      taskDocs.meta.meta.status = 'working';
      // First session failed normally
      taskDocs.conv.sessions.push({
        sessionId: 'sess-failed',
        agentSessionId: 'agent-failed',
        status: 'failed',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: now + 1000,
        totalCostUsd: null,
        durationMs: null,
        error: 'some error',
      });
      // Second session was active when crash happened
      taskDocs.conv.sessions.push({
        sessionId: 'sess-active',
        agentSessionId: 'agent-active',
        status: 'active',
        cwd: '/workspace',
        model: null,
        machineId: null,
        createdAt: now + 2000,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      recoverOrphanedTask(taskDocs, mockLog);

      const manager = new SessionManager(taskDocs);
      const resumeInfo = manager.shouldResume();

      // Should find the interrupted session, not the failed one
      expect(resumeInfo.resume).toBe(true);
      expect(resumeInfo.sessionId).toBe('sess-active');
    });
  });
});
