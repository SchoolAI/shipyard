import { change, createTypedDoc } from '@loro-extended/change';
import { TaskIndexDocumentSchema } from '@shipyard/loro-schema';
import { describe, expect, it, vi } from 'vitest';
import { cleanupStaleSetupEntries, isPidAlive } from './worktree-cleanup.js';

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  };
}

function createRoomDoc() {
  return createTypedDoc(TaskIndexDocumentSchema);
}

const LOCAL_MACHINE = 'my-machine';
const OTHER_MACHINE = 'other-machine';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe('isPidAlive', () => {
  it('returns true for the current process PID', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('returns false for a PID that almost certainly does not exist', () => {
    expect(isPidAlive(999999)).toBe(false);
  });
});

describe('cleanupStaleSetupEntries', () => {
  it('marks orphaned running entry with dead PID as failed', () => {
    const doc = createRoomDoc();
    const log = createMockLogger();

    change(doc, (draft) => {
      draft.worktreeSetupStatus.set('/repo-wt/branch', {
        status: 'running',
        machineId: LOCAL_MACHINE,
        startedAt: Date.now() - 60_000,
        completedAt: null,
        exitCode: null,
        signal: null,
        pid: 999999,
      });
    });

    cleanupStaleSetupEntries(doc, LOCAL_MACHINE, log);

    const json = doc.toJSON();
    const entry = json.worktreeSetupStatus['/repo-wt/branch'];
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('failed');
    expect(entry?.completedAt).toBeGreaterThan(0);
  });

  it('leaves running entry with alive PID alone', () => {
    const doc = createRoomDoc();
    const log = createMockLogger();

    change(doc, (draft) => {
      draft.worktreeSetupStatus.set('/repo-wt/branch', {
        status: 'running',
        machineId: LOCAL_MACHINE,
        startedAt: Date.now() - 60_000,
        completedAt: null,
        exitCode: null,
        signal: null,
        pid: process.pid,
      });
    });

    cleanupStaleSetupEntries(doc, LOCAL_MACHINE, log);

    const json = doc.toJSON();
    const entry = json.worktreeSetupStatus['/repo-wt/branch'];
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('running');
  });

  it('deletes old terminal entry beyond 7-day cutoff', () => {
    const doc = createRoomDoc();
    const log = createMockLogger();

    change(doc, (draft) => {
      draft.worktreeSetupStatus.set('/repo-wt/old-branch', {
        status: 'done',
        machineId: LOCAL_MACHINE,
        startedAt: Date.now() - SEVEN_DAYS_MS - 60_000,
        completedAt: Date.now() - SEVEN_DAYS_MS - 60_000,
        exitCode: 0,
        signal: null,
        pid: null,
      });
    });

    cleanupStaleSetupEntries(doc, LOCAL_MACHINE, log);

    const json = doc.toJSON();
    expect(json.worktreeSetupStatus['/repo-wt/old-branch']).toBeUndefined();
  });

  it('keeps terminal entry within 7-day window', () => {
    const doc = createRoomDoc();
    const log = createMockLogger();

    change(doc, (draft) => {
      draft.worktreeSetupStatus.set('/repo-wt/recent', {
        status: 'done',
        machineId: LOCAL_MACHINE,
        startedAt: Date.now() - 3600_000,
        completedAt: Date.now() - 3600_000,
        exitCode: 0,
        signal: null,
        pid: null,
      });
    });

    cleanupStaleSetupEntries(doc, LOCAL_MACHINE, log);

    const json = doc.toJSON();
    const entry = json.worktreeSetupStatus['/repo-wt/recent'];
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('done');
  });

  it('leaves running entry from a different machine alone', () => {
    const doc = createRoomDoc();
    const log = createMockLogger();

    change(doc, (draft) => {
      draft.worktreeSetupStatus.set('/repo-wt/remote-branch', {
        status: 'running',
        machineId: OTHER_MACHINE,
        startedAt: Date.now() - 60_000,
        completedAt: null,
        exitCode: null,
        signal: null,
        pid: 999999,
      });
    });

    cleanupStaleSetupEntries(doc, LOCAL_MACHINE, log);

    const json = doc.toJSON();
    const entry = json.worktreeSetupStatus['/repo-wt/remote-branch'];
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('running');
  });

  it('handles empty worktreeSetupStatus gracefully', () => {
    const doc = createRoomDoc();
    const log = createMockLogger();

    cleanupStaleSetupEntries(doc, LOCAL_MACHINE, log);

    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });
});
