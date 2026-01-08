import { z } from 'zod';

/**
 * Valid status values for a plan.
 *
 * Flow: draft → pending_review → approved → in_progress → completed
 *                    ↓                          ↓
 *              changes_requested ←──────────────┘
 */
export const PlanStatusValues = [
  'draft',
  'pending_review',
  'approved',
  'changes_requested',
  'in_progress',
  'completed',
] as const;
export type PlanStatusType = (typeof PlanStatusValues)[number];

export interface PlanMetadata {
  id: string;
  title: string;
  status: PlanStatusType;
  createdAt: number;
  updatedAt: number;
  repo?: string;
  pr?: number;
  /** When the plan was reviewed (approved or changes requested) */
  reviewedAt?: number;
  /** Display name of the reviewer */
  reviewedBy?: string;
  /** When the task was marked complete */
  completedAt?: number;
  /** Who marked the task complete (agent or reviewer name) */
  completedBy?: string;
  /** Snapshot URL generated on completion */
  snapshotUrl?: string;
  ownerId?: string;
  /** Defaults to true when ownerId is set */
  approvalRequired?: boolean;
  approvedUsers?: string[];
  /** SHA256 hash of session token for MCP API access */
  sessionTokenHash?: string;
  /** When the plan was archived (hidden from sidebar by default) */
  archivedAt?: number;
  /** Display name of who archived the plan */
  archivedBy?: string;
}

export const PlanMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(PlanStatusValues),
  createdAt: z.number(),
  updatedAt: z.number(),
  repo: z.string().optional(),
  pr: z.number().optional(),
  reviewedAt: z.number().optional(),
  reviewedBy: z.string().optional(),
  completedAt: z.number().optional(),
  completedBy: z.string().optional(),
  snapshotUrl: z.string().optional(),
  ownerId: z.string().optional(),
  approvalRequired: z.boolean().optional(),
  approvedUsers: z.array(z.string()).optional(),
  sessionTokenHash: z.string().optional(),
  archivedAt: z.number().optional(),
  archivedBy: z.string().optional(),
});

export type ArtifactType = 'screenshot' | 'video' | 'test_results' | 'diff';

export interface Artifact {
  id: string;
  type: ArtifactType;
  filename: string;
  url?: string;
  /** Description of what this artifact proves (deliverable name) */
  description?: string;
  /** When the artifact was uploaded */
  uploadedAt?: number;
}

export const ArtifactSchema = z.object({
  id: z.string(),
  type: z.enum(['screenshot', 'video', 'test_results', 'diff']),
  filename: z.string(),
  url: z.string().optional(),
  description: z.string().optional(),
  uploadedAt: z.number().optional(),
});

export function getArtifactUrl(repo: string, pr: number, planId: string, filename: string): string {
  return `https://raw.githubusercontent.com/${repo}/plan-artifacts/pr-${pr}/${planId}/${filename}`;
}

export interface StepCompletion {
  stepId: string;
  completed: boolean;
  completedAt?: number;
  completedBy?: string;
}

/**
 * A deliverable extracted from plan content.
 * Checkboxes marked with {#deliverable} become deliverables.
 */
export interface Deliverable {
  /** Unique ID (typically the BlockNote block ID) */
  id: string;
  /** Checkbox text (e.g., "Screenshot of login page") */
  text: string;
  /** Artifact ID when linked */
  linkedArtifactId?: string;
  /** When the artifact was linked */
  linkedAt?: number;
}

export const DeliverableSchema = z.object({
  id: z.string(),
  text: z.string(),
  linkedArtifactId: z.string().optional(),
  linkedAt: z.number().optional(),
});
