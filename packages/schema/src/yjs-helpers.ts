import * as Y from 'yjs';
import { type AgentPresence, AgentPresenceSchema } from './hook-api.js';
import {
  type Artifact,
  ArtifactSchema,
  type ConversationVersion,
  type Deliverable,
  DeliverableSchema,
  type LinkedPR,
  LinkedPRSchema,
  type PlanMetadata,
  PlanMetadataSchema,
  type PRReviewComment,
  PRReviewCommentSchema,
} from './plan.js';
import { YDOC_KEYS } from './yjs-keys.js';

export function getPlanMetadata(ydoc: Y.Doc): PlanMetadata | null {
  const map = ydoc.getMap('metadata');
  const data = map.toJSON();

  const result = PlanMetadataSchema.safeParse(data);
  if (!result.success) {
    return null;
  }

  return result.data;
}

export function setPlanMetadata(ydoc: Y.Doc, metadata: Partial<PlanMetadata>): void {
  const map = ydoc.getMap('metadata');

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      map.set(key, value);
    }
  }

  map.set('updatedAt', Date.now());
}

export function initPlanMetadata(
  ydoc: Y.Doc,
  init: Omit<PlanMetadata, 'createdAt' | 'updatedAt'>
): void {
  const map = ydoc.getMap('metadata');
  const now = Date.now();

  map.set('id', init.id);
  map.set('title', init.title);
  map.set('status', init.status);
  map.set('createdAt', now);
  map.set('updatedAt', now);

  if (init.repo) map.set('repo', init.repo);
  if (init.pr) map.set('pr', init.pr);

  if (init.ownerId) {
    map.set('ownerId', init.ownerId);
    map.set('approvedUsers', [init.ownerId]);
    map.set('approvalRequired', init.approvalRequired ?? true);
  }

  if (init.sessionTokenHash) {
    map.set('sessionTokenHash', init.sessionTokenHash);
  }

  // Origin tracking for conversation export (Issue #41)
  if (init.origin) {
    map.set('origin', init.origin);
  }
}

export function getStepCompletions(ydoc: Y.Doc): Map<string, boolean> {
  const steps = ydoc.getMap<boolean>('stepCompletions');
  return new Map(steps.entries());
}

export function toggleStepCompletion(ydoc: Y.Doc, stepId: string): void {
  const steps = ydoc.getMap<boolean>('stepCompletions');
  const current = steps.get(stepId) || false;
  steps.set(stepId, !current);
}

export function isStepCompleted(ydoc: Y.Doc, stepId: string): boolean {
  const steps = ydoc.getMap<boolean>('stepCompletions');
  return steps.get(stepId) || false;
}

export function getArtifacts(ydoc: Y.Doc): Artifact[] {
  const array = ydoc.getArray(YDOC_KEYS.ARTIFACTS);
  const data = array.toJSON() as unknown[];

  return data
    .map((item) => ArtifactSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function addArtifact(ydoc: Y.Doc, artifact: Artifact): void {
  const array = ydoc.getArray(YDOC_KEYS.ARTIFACTS);
  array.push([artifact]);
}

export function removeArtifact(ydoc: Y.Doc, artifactId: string): boolean {
  const array = ydoc.getArray(YDOC_KEYS.ARTIFACTS);
  const artifacts = array.toJSON() as Artifact[];
  const index = artifacts.findIndex((a) => a.id === artifactId);

  if (index === -1) return false;

  array.delete(index, 1);
  return true;
}

export function getAgentPresences(ydoc: Y.Doc): Map<string, AgentPresence> {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  const result = new Map<string, AgentPresence>();

  for (const [sessionId, value] of map.entries()) {
    const parsed = AgentPresenceSchema.safeParse(value);
    if (parsed.success) {
      result.set(sessionId, parsed.data);
    }
  }

  return result;
}

export function setAgentPresence(ydoc: Y.Doc, presence: AgentPresence): void {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  map.set(presence.sessionId, presence);
}

export function clearAgentPresence(ydoc: Y.Doc, sessionId: string): boolean {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  if (!map.has(sessionId)) return false;
  map.delete(sessionId);
  return true;
}

export function getAgentPresence(ydoc: Y.Doc, sessionId: string): AgentPresence | null {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  const value = map.get(sessionId);
  if (!value) return null;

  const parsed = AgentPresenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getDeliverables(ydoc: Y.Doc): Deliverable[] {
  const array = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
  const data = array.toJSON() as unknown[];

  return data
    .map((item) => DeliverableSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function addDeliverable(ydoc: Y.Doc, deliverable: Deliverable): void {
  const array = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
  array.push([deliverable]);
}

export function linkArtifactToDeliverable(
  ydoc: Y.Doc,
  deliverableId: string,
  artifactId: string
): boolean {
  const array = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
  const deliverables = array.toJSON() as Deliverable[];
  const index = deliverables.findIndex((d) => d.id === deliverableId);

  if (index === -1) return false;

  const existing = deliverables[index];
  if (!existing) return false; // Should never happen, but TypeScript requires check

  const updated: Deliverable = {
    id: existing.id,
    text: existing.text,
    linkedArtifactId: artifactId,
    linkedAt: Date.now(),
  };

  array.delete(index, 1);
  array.insert(index, [updated]);
  return true;
}

export function getPlanOwnerId(ydoc: Y.Doc): string | null {
  const map = ydoc.getMap('metadata');
  const ownerId = map.get('ownerId');
  return typeof ownerId === 'string' ? ownerId : null;
}

export function isApprovalRequired(ydoc: Y.Doc): boolean {
  const map = ydoc.getMap('metadata');
  const approvalRequired = map.get('approvalRequired');
  if (typeof approvalRequired === 'boolean') {
    return approvalRequired;
  }
  const ownerId = map.get('ownerId');
  return typeof ownerId === 'string' && ownerId.length > 0;
}

export function getApprovedUsers(ydoc: Y.Doc): string[] {
  const map = ydoc.getMap('metadata');
  const approvedUsers = map.get('approvedUsers');
  if (!Array.isArray(approvedUsers)) {
    return [];
  }
  return approvedUsers.filter((id): id is string => typeof id === 'string');
}

export function isUserApproved(ydoc: Y.Doc, userId: string): boolean {
  const ownerId = getPlanOwnerId(ydoc);
  if (ownerId === userId) {
    return true;
  }
  return getApprovedUsers(ydoc).includes(userId);
}

export function approveUser(ydoc: Y.Doc, userId: string): void {
  const map = ydoc.getMap('metadata');
  const currentApproved = getApprovedUsers(ydoc);
  if (currentApproved.includes(userId)) {
    return;
  }
  map.set('approvedUsers', [...currentApproved, userId]);
  map.set('updatedAt', Date.now());
}

export function revokeUser(ydoc: Y.Doc, userId: string): boolean {
  const map = ydoc.getMap('metadata');
  const currentApproved = getApprovedUsers(ydoc);
  const index = currentApproved.indexOf(userId);
  if (index === -1) {
    return false;
  }
  map.set(
    'approvedUsers',
    currentApproved.filter((id) => id !== userId)
  );
  map.set('updatedAt', Date.now());
  return true;
}

export function getRejectedUsers(ydoc: Y.Doc): string[] {
  const map = ydoc.getMap('metadata');
  const rejectedUsers = map.get('rejectedUsers');
  if (!Array.isArray(rejectedUsers)) {
    return [];
  }
  return rejectedUsers.filter((id): id is string => typeof id === 'string');
}

export function isUserRejected(ydoc: Y.Doc, userId: string): boolean {
  return getRejectedUsers(ydoc).includes(userId);
}

export function rejectUser(ydoc: Y.Doc, userId: string): void {
  const map = ydoc.getMap('metadata');
  const currentRejected = getRejectedUsers(ydoc);
  const currentApproved = getApprovedUsers(ydoc);

  // Add to rejected list if not already there
  if (!currentRejected.includes(userId)) {
    map.set('rejectedUsers', [...currentRejected, userId]);
  }

  // Remove from approved list if present
  if (currentApproved.includes(userId)) {
    map.set(
      'approvedUsers',
      currentApproved.filter((id) => id !== userId)
    );
  }

  map.set('updatedAt', Date.now());
}

export function unrejectUser(ydoc: Y.Doc, userId: string): boolean {
  const map = ydoc.getMap('metadata');
  const currentRejected = getRejectedUsers(ydoc);
  const index = currentRejected.indexOf(userId);
  if (index === -1) {
    return false;
  }
  map.set(
    'rejectedUsers',
    currentRejected.filter((id) => id !== userId)
  );
  map.set('updatedAt', Date.now());
  return true;
}

export function getLinkedPRs(ydoc: Y.Doc): LinkedPR[] {
  const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
  const data = array.toJSON() as unknown[];

  return data
    .map((item) => LinkedPRSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function linkPR(ydoc: Y.Doc, pr: LinkedPR): void {
  const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
  const existing = array.toJSON() as LinkedPR[];
  const index = existing.findIndex((p) => p.prNumber === pr.prNumber);

  // Remove existing PR with same number if present
  if (index !== -1) {
    array.delete(index, 1);
  }

  array.push([pr]);
}

export function unlinkPR(ydoc: Y.Doc, prNumber: number): boolean {
  const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
  const existing = array.toJSON() as LinkedPR[];
  const index = existing.findIndex((p) => p.prNumber === prNumber);

  if (index === -1) return false;

  array.delete(index, 1);

  return true;
}

export function getLinkedPR(ydoc: Y.Doc, prNumber: number): LinkedPR | null {
  const prs = getLinkedPRs(ydoc);
  return prs.find((pr) => pr.prNumber === prNumber) ?? null;
}

export function updateLinkedPRStatus(
  ydoc: Y.Doc,
  prNumber: number,
  status: LinkedPR['status']
): boolean {
  const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
  const existing = array.toJSON() as LinkedPR[];
  const index = existing.findIndex((p) => p.prNumber === prNumber);

  if (index === -1) return false;

  const pr = existing[index];
  if (!pr) return false;

  array.delete(index, 1);
  array.insert(index, [{ ...pr, status }]);

  return true;
}

export function getPRReviewComments(ydoc: Y.Doc): PRReviewComment[] {
  const array = ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS);
  const data = array.toJSON() as unknown[];

  return data
    .map((item) => PRReviewCommentSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function getPRReviewCommentsForPR(ydoc: Y.Doc, prNumber: number): PRReviewComment[] {
  return getPRReviewComments(ydoc).filter((c) => c.prNumber === prNumber);
}

export function addPRReviewComment(ydoc: Y.Doc, comment: PRReviewComment): void {
  const array = ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS);
  array.push([comment]);
}

export function resolvePRReviewComment(ydoc: Y.Doc, commentId: string, resolved: boolean): boolean {
  const array = ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS);
  const existing = array.toJSON() as PRReviewComment[];
  const index = existing.findIndex((c) => c.id === commentId);

  if (index === -1) return false;

  const comment = existing[index];
  if (!comment) return false;

  array.delete(index, 1);
  array.insert(index, [{ ...comment, resolved }]);

  return true;
}

export function removePRReviewComment(ydoc: Y.Doc, commentId: string): boolean {
  const array = ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS);
  const existing = array.toJSON() as PRReviewComment[];
  const index = existing.findIndex((c) => c.id === commentId);

  if (index === -1) return false;

  array.delete(index, 1);
  return true;
}

export function markPlanAsViewed(ydoc: Y.Doc, username: string): void {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);

  ydoc.transact(() => {
    // Get existing viewedBy map - must handle Y.Map properly (can't spread it!)
    const existingViewedBy = map.get('viewedBy');
    let viewedBy: Record<string, number> = {};

    if (existingViewedBy instanceof Y.Map) {
      // Convert Y.Map to plain object using iteration (toJSON also works)
      for (const [key, value] of existingViewedBy.entries()) {
        if (typeof value === 'number') {
          viewedBy[key] = value;
        }
      }
    } else if (existingViewedBy && typeof existingViewedBy === 'object') {
      // Handle plain object (shouldn't happen but be safe)
      viewedBy = { ...(existingViewedBy as Record<string, number>) };
    }

    // Record when this user viewed the plan
    viewedBy[username] = Date.now();

    // Use Y.Map for the viewedBy to enable CRDT merging
    const viewedByMap = new Y.Map<number>();
    for (const [user, timestamp] of Object.entries(viewedBy)) {
      viewedByMap.set(user, timestamp);
    }
    map.set('viewedBy', viewedByMap);
  });
}

export function getViewedBy(ydoc: Y.Doc): Record<string, number> {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  const viewedBy = map.get('viewedBy');

  if (!viewedBy) return {};

  // Handle both Y.Map and plain object formats
  if (viewedBy instanceof Y.Map) {
    const result: Record<string, number> = {};
    for (const [key, value] of viewedBy.entries()) {
      if (typeof value === 'number') {
        result[key] = value;
      }
    }
    return result;
  }

  if (typeof viewedBy === 'object') {
    return viewedBy as Record<string, number>;
  }

  return {};
}

export function isPlanUnread(
  metadata: Pick<PlanMetadata, 'updatedAt'>,
  username: string,
  viewedBy?: Record<string, number>
): boolean {
  const viewed = viewedBy ?? {};
  const lastViewed = viewed[username];

  // Never viewed = unread
  if (!lastViewed) return true;

  // Viewed after last update = read
  return lastViewed < metadata.updatedAt;
}

export function getConversationVersions(ydoc: Y.Doc): ConversationVersion[] {
  const metadata = getPlanMetadata(ydoc);
  return metadata?.conversationVersions || [];
}

export function addConversationVersion(ydoc: Y.Doc, version: ConversationVersion): void {
  const metadata = ydoc.getMap(YDOC_KEYS.METADATA);
  const versions = (metadata.get('conversationVersions') as ConversationVersion[]) || [];
  metadata.set('conversationVersions', [version, ...versions]);
  metadata.set('updatedAt', Date.now());
}

export function markVersionHandedOff(ydoc: Y.Doc, versionId: string, handedOffTo: string): void {
  const metadata = ydoc.getMap(YDOC_KEYS.METADATA);
  const versions = (metadata.get('conversationVersions') as ConversationVersion[]) || [];
  const updated = versions.map((v) =>
    v.versionId === versionId ? { ...v, handedOffAt: Date.now(), handedOffTo } : v
  );
  metadata.set('conversationVersions', updated);
  metadata.set('updatedAt', Date.now());
}
