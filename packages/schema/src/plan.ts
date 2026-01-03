import { z } from 'zod';

export interface PlanMetadata {
  id: string;
  title: string;
  status: 'draft' | 'pending_review' | 'approved' | 'changes_requested';
  createdAt: number;
  updatedAt: number;
  repo?: string;
  pr?: number;
}

export const PlanMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'pending_review', 'approved', 'changes_requested']),
  createdAt: z.number(),
  updatedAt: z.number(),
  repo: z.string().optional(),
  pr: z.number().optional(),
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
