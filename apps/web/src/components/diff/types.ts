import type { TaskId } from '@shipyard/loro-schema';

interface CommentBase {
  id: string;
  threadId: string;
  body: string;
  author: string;
  createdAt: number;
  resolved: boolean;
  inReplyTo: string | null;
}

export interface PRComment extends CommentBase {
  kind: 'pr';
  prNumber: number;
  path: string;
  line: number;
}

export interface LocalComment extends CommentBase {
  kind: 'local';
  path: string;
  line: number;
  baseRef: string;
  lineContentHash: string;
  machineId: string | null;
}

export type DiffComment = PRComment | LocalComment;

export interface CommentSupport {
  type: 'pr' | 'local';
  prNumber?: number;
  comments: DiffComment[];
  taskId: TaskId;
  currentUser?: string;
  currentHeadSha?: string;
  lineContentMap?: Map<number, string>;
  machineId?: string;
}

export type DiffViewMode = 'unified' | 'split';
