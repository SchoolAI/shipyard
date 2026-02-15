import { change, createTypedDoc } from '@loro-extended/change';
import { generateSessionId, generateTaskId, TaskDocumentSchema } from '@shipyard/loro-schema';
import { describe, expect, it } from 'vitest';

/**
 * Output verification tests.
 *
 * These tests prove that after a session completes, the Loro task document
 * contains all the expected state: session entry, A2A messages, and task meta.
 * This is the "it worked" proof -- if these pass, the downstream consumer
 * (browser, CLI, or any peer) can read complete session results from the CRDT.
 */
describe('completed session output verification', () => {
  it('task doc contains complete session state after a successful session', () => {
    const taskId = generateTaskId();
    const sessionId = generateSessionId();
    const agentSessionId = 'agent-sess-xyz-789';
    const now = Date.now();
    const completedAt = now + 45_000;

    const doc = createTypedDoc(TaskDocumentSchema);

    change(doc, (draft) => {
      draft.meta.id = taskId;
      draft.meta.title = 'Refactor database queries';
      draft.meta.status = 'submitted';
      draft.meta.createdAt = now;
      draft.meta.updatedAt = now;
    });

    change(doc, (draft) => {
      draft.conversation.push({
        messageId: 'msg-user-1',
        role: 'user',
        content: [{ type: 'text', text: 'Refactor the database queries in user-service.ts' }],
        timestamp: now,
      });
    });

    change(doc, (draft) => {
      draft.conversation.push({
        messageId: 'msg-agent-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'I analyzed the queries and found 3 N+1 problems.' }],
        timestamp: now + 10_000,
      });
    });

    change(doc, (draft) => {
      draft.conversation.push({
        messageId: 'msg-agent-2',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'All 3 queries have been refactored to use batch loading. Tests pass.',
          },
        ],
        timestamp: now + 40_000,
      });
    });

    change(doc, (draft) => {
      draft.sessions.push({
        sessionId,
        agentSessionId,
        status: 'completed',
        cwd: '/home/user/project',
        model: 'claude-opus-4-6',
        machineId: null,
        createdAt: now,
        completedAt,
        totalCostUsd: 0.08,
        durationMs: 45_000,
        error: null,
      });
      draft.meta.status = 'completed';
      draft.meta.updatedAt = completedAt;
    });

    const json = doc.toJSON();

    expect(json.meta.status).toBe('completed');
    expect(json.meta.id).toBe(taskId);
    expect(json.meta.title).toBe('Refactor database queries');
    expect(json.meta.updatedAt).toBe(completedAt);

    expect(json.sessions).toHaveLength(1);
    const session = json.sessions[0];
    expect(session).toBeDefined();
    expect(session?.sessionId).toBe(sessionId);
    expect(session?.agentSessionId).toBe(agentSessionId);
    expect(session?.status).toBe('completed');
    expect(session?.totalCostUsd).toBe(0.08);
    expect(session?.durationMs).toBe(45_000);
    expect(session?.completedAt).toBe(completedAt);
    expect(session?.error).toBeNull();
    expect(session?.cwd).toBe('/home/user/project');
    expect(session?.model).toBe('claude-opus-4-6');

    expect(json.conversation).toHaveLength(3);

    const assistantMessages = json.conversation.filter((m) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

    for (const msg of assistantMessages) {
      expect(msg.content.length).toBeGreaterThan(0);
      const hasTextBlock = msg.content.some((b) => b.type === 'text');
      expect(hasTextBlock).toBe(true);
    }

    const firstAssistantMsg = assistantMessages[0];
    expect(firstAssistantMsg).toBeDefined();
    if (firstAssistantMsg?.content[0]?.type === 'text') {
      expect(firstAssistantMsg.content[0].text).toContain('N+1');
    }
  });

  it('task doc contains failure state after a failed session', () => {
    const taskId = generateTaskId();
    const sessionId = generateSessionId();
    const now = Date.now();
    const failedAt = now + 10_000;

    const doc = createTypedDoc(TaskDocumentSchema);

    change(doc, (draft) => {
      draft.meta.id = taskId;
      draft.meta.title = 'Deploy to production';
      draft.meta.status = 'submitted';
      draft.meta.createdAt = now;
      draft.meta.updatedAt = now;
    });

    change(doc, (draft) => {
      draft.conversation.push({
        messageId: 'msg-agent-fail',
        role: 'assistant',
        content: [{ type: 'text', text: 'Starting deployment...' }],
        timestamp: now + 2000,
      });
    });

    change(doc, (draft) => {
      draft.sessions.push({
        sessionId,
        agentSessionId: 'agent-fail-sess',
        status: 'failed',
        cwd: '/project',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: failedAt,
        totalCostUsd: 0.005,
        durationMs: 10_000,
        error: 'exceeded maximum turns',
      });
      draft.meta.status = 'failed';
      draft.meta.updatedAt = failedAt;
    });

    const json = doc.toJSON();

    expect(json.meta.status).toBe('failed');

    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]?.status).toBe('failed');
    expect(json.sessions[0]?.error).toBe('exceeded maximum turns');
    expect(json.sessions[0]?.totalCostUsd).toBe(0.005);
    expect(json.sessions[0]?.durationMs).toBe(10_000);
    expect(json.sessions[0]?.completedAt).toBe(failedAt);

    expect(json.conversation).toHaveLength(1);
    expect(json.conversation[0]?.role).toBe('assistant');
  });

  it('task doc with multiple sessions accumulates data correctly', () => {
    const taskId = generateTaskId();
    const now = Date.now();

    const doc = createTypedDoc(TaskDocumentSchema);

    change(doc, (draft) => {
      draft.meta.id = taskId;
      draft.meta.title = 'Multi-session task';
      draft.meta.status = 'submitted';
      draft.meta.createdAt = now;
      draft.meta.updatedAt = now;
    });

    const session1Id = generateSessionId();
    change(doc, (draft) => {
      draft.conversation.push({
        messageId: 'msg-s1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Session 1 output' }],
        timestamp: now + 1000,
      });
      draft.sessions.push({
        sessionId: session1Id,
        agentSessionId: 'agent-1',
        status: 'completed',
        cwd: '/project',
        model: 'claude-opus-4-6',
        machineId: null,
        createdAt: now,
        completedAt: now + 5000,
        totalCostUsd: 0.02,
        durationMs: 5000,
        error: null,
      });
      draft.meta.status = 'completed';
      draft.meta.updatedAt = now + 5000;
    });

    const session2Id = generateSessionId();
    change(doc, (draft) => {
      draft.meta.status = 'working';
      draft.conversation.push({
        messageId: 'msg-s2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Session 2 output (resumed)' }],
        timestamp: now + 60_000,
      });
      draft.sessions.push({
        sessionId: session2Id,
        agentSessionId: 'agent-1',
        status: 'completed',
        cwd: '/project',
        model: 'claude-opus-4-6',
        machineId: null,
        createdAt: now + 55_000,
        completedAt: now + 65_000,
        totalCostUsd: 0.01,
        durationMs: 10_000,
        error: null,
      });
      draft.meta.status = 'completed';
      draft.meta.updatedAt = now + 65_000;
    });

    const json = doc.toJSON();

    expect(json.sessions).toHaveLength(2);
    expect(json.sessions[0]?.sessionId).toBe(session1Id);
    expect(json.sessions[1]?.sessionId).toBe(session2Id);
    expect(json.sessions[0]?.status).toBe('completed');
    expect(json.sessions[1]?.status).toBe('completed');

    expect(json.conversation).toHaveLength(2);
    if (json.conversation[0]?.content[0]?.type === 'text') {
      expect(json.conversation[0].content[0].text).toBe('Session 1 output');
    }
    if (json.conversation[1]?.content[0]?.type === 'text') {
      expect(json.conversation[1].content[0].text).toBe('Session 2 output (resumed)');
    }

    expect(json.meta.status).toBe('completed');
  });
});
