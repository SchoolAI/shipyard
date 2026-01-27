/**
 * Cloudflare Worker for Open Graph meta tag injection
 *
 * Intercepts requests to Shipyard URLs with ?d= parameter (plan snapshots)
 * and injects dynamic OG meta tags for social media crawlers.
 *
 * Flow:
 * 1. Request comes in (e.g., Slackbot fetching a shared link)
 * 2. If crawler User-Agent detected AND has ?d= param:
 *    - Decode the lz-string compressed plan data
 *    - Extract title, status, description
 *    - Return HTML with dynamic OG tags + redirect to real app
 * 3. If regular user: proxy directly to upstream (GitHub Pages)
 */

import lzstring from 'lz-string';
import { ImageResponse } from 'workers-og';
import { logger } from './logger.js';

export interface Env {
  ENVIRONMENT: 'development' | 'production';
  UPSTREAM_URL: string;
  CANONICAL_BASE_URL: string;
}

/** Plan status values - mirrors @shipyard/schema */
const PLAN_STATUS_VALUES = [
  'draft',
  'pending_review',
  'changes_requested',
  'in_progress',
  'completed',
] as const;

type PlanStatus = (typeof PLAN_STATUS_VALUES)[number];

/** Minimal plan structure for OG tag generation */
interface DecodedPlan {
  v: number;
  id: string;
  title: string;
  status: PlanStatus;
  repo?: string;
  pr?: number;
  content?: unknown[];
  deliverables?: Array<{ text: string; linkedArtifactId?: string }>;
}

/**
 * Known crawler User-Agents that need OG tags.
 * These bots don't execute JavaScript, so they need the OG tags in the HTML.
 */
const CRAWLER_PATTERNS = [
  /Slackbot/i,
  /Twitterbot/i,
  /facebookexternalhit/i,
  /LinkedInBot/i,
  /Googlebot/i,
  /Discordbot/i,
  /WhatsApp/i,
  /TelegramBot/i,
  /Baiduspider/i,
  /bingbot/i,
  /Embedly/i,
  /Quora Link Preview/i,
  /Showyoubot/i,
  /outbrain/i,
  /pinterest/i,
  /applebot/i,
  /redditbot/i,
];

function isCrawler(userAgent: string): boolean {
  return CRAWLER_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Decode plan from lz-string compressed URL parameter.
 * Minimal validation - just enough to extract OG tag data.
 */
function decodePlan(encoded: string): DecodedPlan | null {
  try {
    const json = lzstring.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;

    const parsed = JSON.parse(json) as Record<string, unknown>;

    // Minimal validation
    if (typeof parsed.v !== 'number') return null;
    if (typeof parsed.id !== 'string') return null;
    if (typeof parsed.title !== 'string') return null;
    if (typeof parsed.status !== 'string') return null;

    // Validate status is known
    if (!PLAN_STATUS_VALUES.includes(parsed.status as PlanStatus)) {
      return null;
    }

    return parsed as unknown as DecodedPlan;
  } catch (error) {
    logger.error({ error }, 'Failed to decode plan');
    return null;
  }
}

/** Status emoji for visual flair in previews */
function getStatusEmoji(status: PlanStatus): string {
  switch (status) {
    case 'draft':
      return '📝';
    case 'pending_review':
      return '👀';
    case 'changes_requested':
      return '🔄';
    case 'in_progress':
      return '🚀';
    case 'completed':
      return '✅';
  }
}

/** Human-readable status label */
function getStatusLabel(status: PlanStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending_review':
      return 'Pending Review';
    case 'changes_requested':
      return 'Changes Requested';
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
  }
}

/**
 * Extract text from a single BlockNote block's content array.
 */
function extractTextFromContent(content: unknown[]): string[] {
  const texts: string[] = [];
  for (const item of content) {
    if (item && typeof item === 'object') {
      const c = item as Record<string, unknown>;
      if (typeof c.text === 'string') {
        texts.push(c.text);
      }
    }
  }
  return texts;
}

/**
 * Recursively collect text from a BlockNote block and its children.
 */
function collectBlockText(block: unknown, textParts: string[]): void {
  if (!block || typeof block !== 'object') return;

  const b = block as Record<string, unknown>;

  // Extract text from content array (BlockNote inline content)
  if (Array.isArray(b.content)) {
    textParts.push(...extractTextFromContent(b.content));
  }

  // Recurse into children
  if (Array.isArray(b.children)) {
    for (const child of b.children) {
      collectBlockText(child, textParts);
    }
  }
}

/**
 * Truncate text at word boundary with ellipsis.
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > maxLength * 0.7 ? lastSpace : maxLength;
  return `${truncated.slice(0, cutPoint)}…`;
}

/**
 * Extract text content from BlockNote blocks for description.
 * Walks the block tree and extracts text from paragraphs/headings.
 */
function extractTextFromBlocks(blocks: unknown[], maxLength: number = 160): string {
  const textParts: string[] = [];

  for (const block of blocks) {
    collectBlockText(block, textParts);
    // Early exit if we have enough text
    if (textParts.join(' ').length > maxLength * 2) break;
  }

  const fullText = textParts.join(' ').trim();
  return truncateAtWordBoundary(fullText, maxLength);
}

/**
 * Build description from plan data.
 * Format: "✅ Completed · 2/3 deliverables · First few words of content..."
 */
function buildDescription(plan: DecodedPlan): string {
  const parts: string[] = [];

  // Status with emoji
  parts.push(`${getStatusEmoji(plan.status)} ${getStatusLabel(plan.status)}`);

  // Deliverable completion ratio (completed = has linkedArtifactId)
  if (plan.deliverables && plan.deliverables.length > 0) {
    const total = plan.deliverables.length;
    const completed = plan.deliverables.filter((d) => d.linkedArtifactId).length;
    parts.push(`${completed}/${total} deliverable${total === 1 ? '' : 's'}`);
  }

  // Repo/PR context
  if (plan.repo && plan.pr) {
    parts.push(`${plan.repo}#${plan.pr}`);
  } else if (plan.repo) {
    parts.push(plan.repo);
  }

  let description = parts.join(' · ');

  // Add content excerpt if we have room
  if (plan.content && Array.isArray(plan.content)) {
    const contentText = extractTextFromBlocks(plan.content, 100);
    if (contentText) {
      description += ` — ${contentText}`;
    }
  }

  // Ensure reasonable length for OG description
  if (description.length > 200) {
    description = `${description.slice(0, 197)}…`;
  }

  return description;
}

/** Escape HTML special characters to prevent XSS */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Default dimensions for oEmbed iframe */
const OEMBED_DEFAULT_WIDTH = 600;
const OEMBED_DEFAULT_HEIGHT = 400;

/** oEmbed response type per spec */
interface OEmbedResponse {
  version: '1.0';
  type: 'rich';
  title: string;
  provider_name: string;
  provider_url: string;
  html: string;
  width: number;
  height: number;
  thumbnail_url: string;
}

/**
 * Build oEmbed JSON response for a plan URL.
 * Per oEmbed spec: https://oembed.com/
 */
function buildOEmbedResponse(
  plan: DecodedPlan,
  _originalUrl: string,
  encodedPlan: string,
  env: Env,
  maxWidth?: number,
  maxHeight?: number
): OEmbedResponse {
  // Respect maxwidth/maxheight constraints per oEmbed spec
  const width = maxWidth ? Math.min(maxWidth, OEMBED_DEFAULT_WIDTH) : OEMBED_DEFAULT_WIDTH;
  const height = maxHeight ? Math.min(maxHeight, OEMBED_DEFAULT_HEIGHT) : OEMBED_DEFAULT_HEIGHT;

  // Build embed URL - uses root path with ?d= param (snapshot mode)
  const embedUrl = new URL(env.CANONICAL_BASE_URL);
  embedUrl.searchParams.set('d', encodedPlan);

  // Build iframe HTML for rich embed
  const iframeHtml = `<iframe src="${escapeHtml(embedUrl.toString())}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;

  // Dynamic thumbnail URL with plan data
  const thumbnailUrl = `${env.CANONICAL_BASE_URL}/og-image?d=${encodeURIComponent(encodedPlan)}`;

  return {
    version: '1.0',
    type: 'rich',
    title: plan.title,
    provider_name: 'Shipyard',
    provider_url: env.CANONICAL_BASE_URL,
    html: iframeHtml,
    width,
    height,
    thumbnail_url: thumbnailUrl,
  };
}

/**
 * CORS headers for oEmbed endpoint (public API).
 * oEmbed spec requires this to be accessible from browsers.
 */
const OEMBED_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** OG Image dimensions per social media best practices */
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

/**
 * Shipyard theme colors - exact matches from apps/web/src/index.css
 * These are the canonical brand colors used across the app.
 */
const THEME = {
  // Primary Brand (Picton Blue)
  pictonBlue: {
    400: '#42cde5',
    500: '#42cde5',
    600: '#42cde5', // primary
  },
  // Orange Roughy (for accent bar and warnings)
  orange: {
    500: '#cc5113', // matches warning color
    600: '#a63f0d',
  },
  // Neutrals (Blue-tinted)
  slate: {
    200: '#d6e1e0',
    400: '#748fb0',
    500: '#4a5b74',
    700: '#4a5b74',
    800: '#13192e',
    900: '#13192e',
    950: '#13192e',
  },
  // Accent (My Pink - AI indicators)
  accent: '#cb9380',
  // Status colors
  success: '#10b981', // emerald-500
  warning: '#cc5113', // orange-roughy
  danger: '#a51100', // bright-red
} as const;

/**
 * Status color mapping - matches HeroUI semantic colors from StatusChip.tsx
 * See apps/web/src/components/StatusChip.tsx and apps/web/tailwind.config.ts
 */
function getStatusColor(status: PlanStatus): string {
  switch (status) {
    case 'draft':
      return THEME.slate[500]; // HeroUI default
    case 'pending_review':
      return THEME.warning; // HeroUI warning
    case 'changes_requested':
      return THEME.danger; // HeroUI danger
    case 'in_progress':
      return THEME.accent; // HeroUI accent (violet)
    case 'completed':
      return THEME.success; // HeroUI success
  }
}

/**
 * Truncate title for display, adding ellipsis if needed.
 * OG images have limited space - aim for max 2 lines.
 */
function truncateTitle(title: string, maxLength: number = OG_DESIGN.title.maxLength): string {
  if (title.length <= maxLength) return title;
  // Try to break at a word boundary
  const truncated = title.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > maxLength * 0.6 ? lastSpace : maxLength;
  return `${truncated.slice(0, cutPoint)}...`;
}

/** OG Image design constants - uses 24px grid unit */
const OG_DESIGN = {
  logo: {
    size: 120, // Slightly smaller for better balance
    borderRadius: 20,
  },
  title: {
    fontSize: 64, // Slightly smaller for 2-line titles to fit
    maxLength: 70, // Allow longer titles
  },
  status: {
    height: 48, // Balanced status badge
    fontSize: 28, // Readable text
    dotSize: 14, // Status indicator
    paddingV: 12,
    paddingH: 28,
    borderRadius: 24, // Pill shape
  },
  progress: {
    height: 24, // Sleek progress bar (1 grid unit)
    fontSize: 40, // Large percentage
    labelSize: 28, // "complete" label
    borderRadius: 12, // Half of height for rounded ends
  },
  spacing: {
    padding: 64, // Outer padding (~2.5 grid units)
    sectionGap: 48, // Gap between header/title and title/progress (2 grid units)
  },
} as const;

/**
 * Production URL for static assets.
 * Always use production URL for logo to ensure reliable fetching in OG image generation.
 * workers-og (Satori) cannot fetch from localhost in dev mode.
 */
const STATIC_ASSETS_URL = 'https://schoolai.github.io/shipyard';

/**
 * Build logo HTML using the actual Shipyard PNG.
 * Always uses production URL for reliable image fetching in workers-og.
 *
 * NOTE: We don't use env.UPSTREAM_URL here because workers-og cannot fetch
 * from localhost when running in wrangler dev mode.
 *
 * IMPORTANT: Satori requires explicit width and height attributes on img tags.
 */
function buildLogoHtml(): string {
  const logoUrl = `${STATIC_ASSETS_URL}/icon-512.png`;
  return `<img src="${logoUrl}" width="${OG_DESIGN.logo.size}" height="${OG_DESIGN.logo.size}" style="display: flex; border-radius: ${OG_DESIGN.logo.borderRadius}px;" />`;
}

/**
 * Build HTML markup for OG image generation.
 * Uses inline styles because workers-og parses HTML, not React/JSX.
 *
 * Design goals:
 * - Large, prominent title (main focus)
 * - Visual progress indicator (not just numbers)
 * - Distinctive branding with actual Shipyard logo
 * - Don't duplicate text description info (that's in the text preview)
 * - Match web app's HeroUI dark theme exactly
 * - Grid alignment: logo left edge aligns with title/progress left edge
 * - Grid alignment: status badge right edge aligns with progress bar right edge
 *
 * IMPORTANT: workers-og (based on Satori) has limitations:
 * - Use width/height in vh/vw units for root, not percentages
 * - No native emoji support (renders as black lines)
 * - External image fetching can be unreliable in dev mode
 * - No linear-gradient support
 */
function buildOgImageHtml(plan: DecodedPlan): string {
  const title = escapeHtml(truncateTitle(plan.title));
  const statusLabel = getStatusLabel(plan.status);
  const statusColor = getStatusColor(plan.status);

  // Calculate deliverables progress
  const total = plan.deliverables?.length ?? 0;
  const completed = plan.deliverables?.filter((d) => d.linkedArtifactId).length ?? 0;
  const filledPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Spacing constants for consistent grid (24px base unit)
  const pad = OG_DESIGN.spacing.padding;
  const sectionGap = OG_DESIGN.spacing.sectionGap;

  // Progress section - prominent visual progress bar (only if there are deliverables)
  const progressSection =
    total > 0
      ? `
      <div style="display: flex; flex-direction: column; width: 100%; margin-top: ${sectionGap}px;">
        <div style="display: flex; align-items: baseline; margin-bottom: 12px;">
          <span style="font-size: ${OG_DESIGN.progress.fontSize}px; font-weight: 700; color: white;">${filledPercent}%</span>
          <span style="font-size: ${OG_DESIGN.progress.labelSize}px; color: ${THEME.slate[400]}; margin-left: 12px;">complete</span>
        </div>
        <div style="display: flex; width: 100%; height: ${OG_DESIGN.progress.height}px; background-color: ${THEME.slate[700]}; border-radius: ${OG_DESIGN.progress.borderRadius}px; overflow: hidden;">
          <div style="display: flex; width: ${filledPercent}%; height: ${OG_DESIGN.progress.height}px; background-color: ${THEME.pictonBlue[600]};"></div>
        </div>
      </div>
    `
      : '';

  // Status pill with color coding - larger and more prominent
  const statusPill = `
    <div style="display: flex; align-items: center; background-color: ${THEME.slate[800]}; border-radius: ${OG_DESIGN.status.borderRadius}px; padding: ${OG_DESIGN.status.paddingV}px ${OG_DESIGN.status.paddingH}px;">
      <div style="display: flex; width: ${OG_DESIGN.status.dotSize}px; height: ${OG_DESIGN.status.dotSize}px; background-color: ${statusColor}; border-radius: ${OG_DESIGN.status.dotSize / 2}px; margin-right: 16px;"></div>
      <span style="font-size: ${OG_DESIGN.status.fontSize}px; font-weight: 600; color: ${THEME.slate[200]};">${statusLabel}</span>
    </div>
  `;

  return `<div style="display: flex; flex-direction: column; width: 100vw; height: 100vh; background-color: ${THEME.slate[900]}; font-family: sans-serif; color: white;">
  <!-- Accent bar at top - Picton Blue (light blue) -->
  <div style="display: flex; width: 100%; height: 8px; background-color: ${THEME.pictonBlue[500]};"></div>

  <!-- Main content area -->
  <div style="display: flex; flex-direction: column; flex: 1; padding: ${pad}px;">
    <!-- Header row: Logo and Status - aligned with content edges -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: ${sectionGap}px;">
      <!-- Logo with wordmark -->
      <div style="display: flex; align-items: center;">
        ${buildLogoHtml()}
        <span style="font-size: 40px; font-weight: 700; color: ${THEME.slate[200]}; margin-left: 20px;">Shipyard</span>
      </div>
      <!-- Status badge -->
      <div style="display: flex;">
        ${statusPill}
      </div>
    </div>

    <!-- Title - main focus, vertically centered in remaining space -->
    <div style="display: flex; flex: 1; align-items: center;">
      <span style="font-size: ${OG_DESIGN.title.fontSize}px; font-weight: 700; color: white; line-height: 1.2;">${title}</span>
    </div>

    <!-- Progress section at bottom -->
    ${progressSection}
  </div>
</div>`;
}

/**
 * Generate a cache key from plan data for Cloudflare Cache API.
 * Uses a hash of relevant plan fields to create deterministic keys.
 */
async function generateCacheKey(plan: DecodedPlan, baseUrl: string): Promise<string> {
  // Create a deterministic string from plan data that affects the image
  const cacheData = JSON.stringify({
    id: plan.id,
    title: plan.title,
    status: plan.status,
    repo: plan.repo,
    pr: plan.pr,
    deliverables: plan.deliverables?.map((d) => ({
      text: d.text,
      hasArtifact: !!d.linkedArtifactId,
    })),
  });

  // Use Web Crypto API to create a hash
  const encoder = new TextEncoder();
  const data = encoder.encode(cacheData);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `${baseUrl}/og-image-cache/${hashHex}.png`;
}

/**
 * Handle /og-image endpoint requests.
 * Generates a PNG image with plan information for social media previews.
 * Uses Cloudflare Cache API in production to avoid CPU limit issues on free tier.
 *
 * NOTE: Cache is disabled in development because `caches.default` can cause
 * requests to hang in wrangler dev mode.
 */
async function handleOgImageRequest(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const encodedPlan = url.searchParams.get('d');

  if (!encodedPlan) {
    return new Response('Missing required "d" parameter with encoded plan data', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const plan = decodePlan(encodedPlan);
  if (!plan) {
    return new Response('Failed to decode plan data', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Only use cache in production - wrangler dev has issues with caches.default
  const useCache = env.ENVIRONMENT === 'production';

  if (useCache) {
    try {
      const cache = caches.default;
      const cacheKey = await generateCacheKey(plan, env.CANONICAL_BASE_URL);
      const cacheRequest = new Request(cacheKey);

      const cachedResponse = await cache.match(cacheRequest);
      if (cachedResponse) {
        logger.debug({ cacheKey }, 'Serving OG image from cache');
        return cachedResponse;
      }
    } catch (cacheError) {
      // Cache lookup failed - continue to generate image
      logger.warn({ error: cacheError }, 'Cache lookup failed, generating fresh image');
    }
  }

  logger.info({ planId: plan.id, title: plan.title }, 'Generating OG image');

  // Generate the image - return ImageResponse directly per workers-og docs
  const html = buildOgImageHtml(plan);

  // In development, skip caching and return directly
  if (!useCache) {
    return new ImageResponse(html, {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    });
  }

  // Production: check cache first, then generate
  try {
    const cache = caches.default;
    const cacheKey = await generateCacheKey(plan, env.CANONICAL_BASE_URL);
    const cacheRequest = new Request(cacheKey);

    const cachedResponse = await cache.match(cacheRequest);
    if (cachedResponse) {
      logger.debug({ cacheKey }, 'Serving OG image from cache (second check)');
      return cachedResponse;
    }

    // Generate and cache
    const imageResponse = new ImageResponse(html, {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    });

    // Clone before consuming for cache
    const responseToCache = imageResponse.clone();
    const headers = new Headers(responseToCache.headers);
    headers.set('Cache-Control', 'public, max-age=3600');

    const cacheable = new Response(responseToCache.body, {
      status: responseToCache.status,
      headers,
    });

    ctx.waitUntil(cache.put(cacheRequest, cacheable));

    return imageResponse;
  } catch (cacheError) {
    logger.warn({ error: cacheError }, 'Cache operation failed, returning uncached image');
    return new ImageResponse(html, {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    });
  }
}

/**
 * Handle /oembed endpoint requests.
 * Returns oEmbed JSON for the provided URL.
 */
function handleOEmbedRequest(url: URL, env: Env): Response {
  // Get required url parameter
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing required "url" parameter' }), {
      status: 400,
      headers: {
        ...OEMBED_CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Parse the target URL to extract the ?d= parameter
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
      status: 400,
      headers: {
        ...OEMBED_CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Extract encoded plan data
  const encodedPlan = parsedUrl.searchParams.get('d');
  if (!encodedPlan) {
    return new Response(
      JSON.stringify({ error: 'URL must contain a ?d= parameter with plan data' }),
      {
        status: 400,
        headers: {
          ...OEMBED_CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );
  }

  // Decode the plan
  const plan = decodePlan(encodedPlan);
  if (!plan) {
    return new Response(JSON.stringify({ error: 'Failed to decode plan data from URL' }), {
      status: 400,
      headers: {
        ...OEMBED_CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Get optional maxwidth/maxheight per oEmbed spec
  const maxWidth = url.searchParams.get('maxwidth');
  const maxHeight = url.searchParams.get('maxheight');

  // Build canonical URL for the embed
  const canonicalUrl = new URL(env.CANONICAL_BASE_URL);
  canonicalUrl.search = parsedUrl.search;

  const oembedResponse = buildOEmbedResponse(
    plan,
    canonicalUrl.toString(),
    encodedPlan,
    env,
    maxWidth ? parseInt(maxWidth, 10) : undefined,
    maxHeight ? parseInt(maxHeight, 10) : undefined
  );

  return new Response(JSON.stringify(oembedResponse), {
    status: 200,
    headers: {
      ...OEMBED_CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
}

/**
 * Build complete HTML page with OG tags for crawlers.
 * Includes meta refresh to redirect browsers that somehow land here.
 */
function buildOgHtml(plan: DecodedPlan, fullUrl: string, encodedPlan: string, env: Env): string {
  const title = escapeHtml(plan.title);
  const description = escapeHtml(buildDescription(plan));
  // Dynamic OG image URL - includes plan data for dynamic generation
  const ogImageUrl = `${env.CANONICAL_BASE_URL}/og-image?d=${encodeURIComponent(encodedPlan)}`;

  // Build oEmbed discovery URL
  const oembedUrl = `${env.CANONICAL_BASE_URL}/oembed?url=${encodeURIComponent(fullUrl)}&format=json`;

  // Theme colors from the app - use exact THEME constants
  const themeColor = THEME.pictonBlue[600];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta Tags -->
  <title>${title} - Shipyard</title>
  <meta name="title" content="${title} - Shipyard" />
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />

  <!-- Open Graph / Facebook / LinkedIn / Slack / Discord -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(fullUrl)}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${title}" />
  <meta property="og:site_name" content="Shipyard" />
  <meta property="og:locale" content="en_US" />

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${escapeHtml(fullUrl)}" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${ogImageUrl}" />
  <meta name="twitter:image:alt" content="${title}" />

  <!-- oEmbed Discovery -->
  <link rel="alternate" type="application/json+oembed" href="${escapeHtml(oembedUrl)}" title="${title}" />

  <!-- Redirect browsers to the real app -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(fullUrl)}" />

  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: ${THEME.slate[900]};
      color: ${THEME.slate[200]};
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      color: ${themeColor};
      margin-bottom: 0.5rem;
    }
    p {
      color: ${THEME.slate[400]};
    }
    a {
      color: ${themeColor};
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>${description}</p>
    <p>Redirecting to <a href="${escapeHtml(fullUrl)}">Shipyard</a>...</p>
  </div>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || '';

    // Handle CORS preflight for oEmbed endpoint
    if (request.method === 'OPTIONS' && url.pathname === '/oembed') {
      return new Response(null, {
        status: 204,
        headers: OEMBED_CORS_HEADERS,
      });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'OK',
          service: 'og-proxy',
          environment: env.ENVIRONMENT,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Dynamic OG image generation endpoint
    if (url.pathname === '/og-image') {
      logger.info({ search: url.search }, 'OG image request received');
      return handleOgImageRequest(url, env, ctx);
    }

    // oEmbed endpoint for rich embeds (Slack, Teams, Notion, etc.)
    if (url.pathname === '/oembed') {
      logger.info({ search: url.search }, 'oEmbed request received');
      return handleOEmbedRequest(url, env);
    }

    // Check if this is a crawler AND has plan data
    const encodedPlan = url.searchParams.get('d');
    const shouldInjectOg = isCrawler(userAgent) && encodedPlan;

    if (shouldInjectOg) {
      logger.info(
        { userAgent, planParam: encodedPlan?.slice(0, 50) },
        'Crawler detected, injecting OG tags'
      );

      const plan = decodePlan(encodedPlan);
      if (plan) {
        // Build canonical URL for OG tags
        const canonicalUrl = new URL(env.CANONICAL_BASE_URL);
        canonicalUrl.search = url.search;

        const html = buildOgHtml(plan, canonicalUrl.toString(), encodedPlan, env);

        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          },
        });
      }

      // If decode failed, log and fall through to upstream
      logger.warn(
        { encodedPlan: encodedPlan.slice(0, 100) },
        'Failed to decode plan, proxying to upstream'
      );
    }

    // For regular users or failed decode: proxy to upstream
    const upstreamUrl = new URL(env.UPSTREAM_URL);
    upstreamUrl.pathname = url.pathname;
    upstreamUrl.search = url.search;

    logger.debug({ upstream: upstreamUrl.toString() }, 'Proxying to upstream');

    const response = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers: request.headers,
    });

    // Clone response and add CORS headers if needed
    const newHeaders = new Headers(response.headers);

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  },
};
