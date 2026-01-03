import type { Block } from '@blocknote/core';
import lzstring from 'lz-string';
import type { Artifact } from './plan.js';

/**
 * URL-encoded plan structure.
 * This is a snapshot of the plan state that can be shared via URL.
 */
export interface UrlEncodedPlan {
  v: 1;
  id: string;
  title: string;
  status: string;
  repo?: string;
  pr?: number;
  content: Block[];
  artifacts?: Artifact[];

  comments?: unknown[];
}

/**
 * Encodes a plan to a URL-safe compressed string.
 *
 * Uses lz-string compression + URI encoding for maximum compatibility.
 * Typical compression: 40-60% reduction.
 */
export function encodePlan(plan: UrlEncodedPlan): string {
  const json = JSON.stringify(plan);
  return lzstring.compressToEncodedURIComponent(json);
}

/**
 * Decodes a URL-encoded plan string.
 *
 * Returns null if decoding fails or data is corrupted.
 */
export function decodePlan(encoded: string): UrlEncodedPlan | null {
  try {
    const json = lzstring.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;

    const plan = JSON.parse(json) as UrlEncodedPlan;

    if (plan.v !== 1) {
    }

    return plan;
  } catch (_error) {
    return null;
  }
}

/**
 * Creates a complete plan URL from a plan object.
 *
 * @param baseUrl - Base URL for the app (e.g., "https://org.github.io/peer-plan")
 * @param plan - Plan object to encode
 * @returns Complete URL with encoded plan
 */
export function createPlanUrl(baseUrl: string, plan: UrlEncodedPlan): string {
  const encoded = encodePlan(plan);
  const url = new URL(baseUrl);
  url.searchParams.set('d', encoded);
  return url.toString();
}

/**
 * Extracts and decodes plan from current URL.
 *
 * @returns Decoded plan or null if not found/invalid
 */
export function getPlanFromUrl(): UrlEncodedPlan | null {
  if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
    const location = (globalThis as typeof globalThis & { location: { search: string } }).location;
    const params = new URLSearchParams(location.search);
    const encoded = params.get('d');
    if (!encoded) return null;

    return decodePlan(encoded);
  }

  return null;
}
