import type { TaskStatus } from '@shipyard/loro-schema';
import lzstring from 'lz-string';
import { z } from 'zod';

const TASK_STATUS_VALUES = [
  'draft',
  'pending_review',
  'changes_requested',
  'in_progress',
  'completed',
] as const;

const SnapshotDeliverableSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  linkedArtifactId: z.string().nullable().optional(),
  linkedAt: z.number().optional(),
});

const SnapshotArtifactSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  url: z.string(),
  createdAt: z.number(),
  deliverableId: z.string().nullable().optional(),
});

const UrlEncodedTaskV1Schema = z.object({
  v: z.literal(1),
  id: z.string(),
  title: z.string(),
  status: z.enum(TASK_STATUS_VALUES),
  repo: z.string().optional(),
  pr: z.number().optional(),
  content: z.array(z.unknown()).optional(),
  artifacts: z.array(SnapshotArtifactSchema).optional(),
  deliverables: z.array(SnapshotDeliverableSchema).optional(),
});

export type UrlEncodedTask = z.infer<typeof UrlEncodedTaskV1Schema>;

export interface SnapshotDeliverable {
  id?: string;
  text: string;
  linkedArtifactId?: string | null;
  linkedAt?: number;
}

export interface SnapshotArtifact {
  id: string;
  name: string;
  type: string;
  url: string;
  createdAt: number;
  deliverableId?: string | null;
}

export function encodeTask(task: UrlEncodedTask): string {
  const json = JSON.stringify(task);
  return lzstring.compressToEncodedURIComponent(json);
}

export function decodeTask(encoded: string): UrlEncodedTask | null {
  try {
    const json = lzstring.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;

    const parsed: unknown = JSON.parse(json);
    const result = UrlEncodedTaskV1Schema.safeParse(parsed);
    if (!result.success) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

export function createTaskUrl(baseUrl: string, task: UrlEncodedTask): string {
  const encoded = encodeTask(task);
  const url = new URL(baseUrl);
  url.searchParams.set('d', encoded);
  return url.toString();
}

function getLocationSearch(): string | null {
  if (typeof globalThis === 'undefined') return null;
  if (!('location' in globalThis)) return null;

  const globalRecord = Object.fromEntries(Object.entries(globalThis));
  const location = globalRecord.location;
  if (typeof location !== 'object' || location === null) return null;
  if (!('search' in location)) return null;

  const locationRecord = Object.fromEntries(Object.entries(location));
  const search = locationRecord.search;
  return typeof search === 'string' ? search : null;
}

export function getTaskFromUrl(): UrlEncodedTask | null {
  const search = getLocationSearch();
  if (!search) return null;

  const params = new URLSearchParams(search);
  const encoded = params.get('d');
  if (!encoded) return null;

  return decodeTask(encoded);
}

export function hasSnapshotParam(): boolean {
  const search = getLocationSearch();
  if (!search) return false;

  const params = new URLSearchParams(search);
  return params.has('d');
}

export function getSnapshotParam(): string | null {
  const search = getLocationSearch();
  if (!search) return null;

  const params = new URLSearchParams(search);
  return params.get('d');
}

export function isValidTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && TASK_STATUS_VALUES.some((status) => status === value);
}
