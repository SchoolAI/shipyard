import { z } from 'zod';

/**
 * Valid status values for a plan.
 */
export const PlanStatusValues = [
  'draft',
  'pending_review',
  'approved',
  'changes_requested',
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
});

export type ArtifactType = 'screenshot' | 'video' | 'test_results' | 'diff';

export interface Artifact {
  id: string;
  type: ArtifactType;
  filename: string;
  url?: string;
}

export const ArtifactSchema = z.object({
  id: z.string(),
  type: z.enum(['screenshot', 'video', 'test_results', 'diff']),
  filename: z.string(),
  url: z.string().optional(),
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
