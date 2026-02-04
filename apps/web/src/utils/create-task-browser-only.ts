import type { Repo } from '@loro-extended/repo';
import { generateTaskId, RoomSchema, TaskDocumentSchema, type TaskId } from '@shipyard/loro-schema';
import { nanoid } from 'nanoid';

export interface CreateTaskBrowserResult {
  taskId: TaskId;
  sessionToken: string;
  url: string;
}

export interface CreateTaskBrowserOptions {
  title: string;
  ownerId: string;
  repo: Repo;
}

async function hashSessionToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateSessionToken(): string {
  return nanoid(32);
}

export async function createTaskBrowserOnly(
  options: CreateTaskBrowserOptions
): Promise<CreateTaskBrowserResult> {
  const { title, ownerId, repo } = options;

  const taskId = generateTaskId();
  const sessionToken = generateSessionToken();
  const sessionTokenHash = await hashSessionToken(sessionToken);
  const now = Date.now();

  const roomHandle = repo.get('room', RoomSchema);
  const taskHandle = repo.get(taskId, TaskDocumentSchema);

  taskHandle.change((doc) => {
    doc.meta.id = taskId;
    doc.meta.title = title;
    doc.meta.status = 'draft';
    doc.meta.createdAt = now;
    doc.meta.updatedAt = now;
    doc.meta.completedAt = null;
    doc.meta.completedBy = null;
    doc.meta.ownerId = ownerId;
    doc.meta.sessionTokenHash = sessionTokenHash;
    doc.meta.epoch = 1;
    doc.meta.repo = null;
    doc.meta.archivedAt = null;
    doc.meta.archivedBy = null;
    // Tasks created from browser are public by default (no approval required)
    doc.meta.approvalRequired = false;

    doc.events.push({
      id: nanoid(),
      type: 'task_created',
      actor: ownerId,
      timestamp: now,
      inboxWorthy: null,
      inboxFor: null,
    });
  });

  roomHandle.change((doc) => {
    doc.taskIndex.set(taskId, {
      taskId,
      title,
      status: 'draft',
      ownerId,
      hasPendingRequests: false,
      lastUpdated: now,
      createdAt: now,
    });
  });

  const webUrl = `${window.location.origin}/task/${taskId}`;

  return {
    taskId,
    sessionToken,
    url: webUrl,
  };
}
