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
  originalUrl: string,
  env: Env,
  maxWidth?: number,
  maxHeight?: number
): OEmbedResponse {
  // Respect maxwidth/maxheight constraints per oEmbed spec
  const width = maxWidth ? Math.min(maxWidth, OEMBED_DEFAULT_WIDTH) : OEMBED_DEFAULT_WIDTH;
  const height = maxHeight ? Math.min(maxHeight, OEMBED_DEFAULT_HEIGHT) : OEMBED_DEFAULT_HEIGHT;

  // Build embed URL (add embed=true param)
  const embedUrl = new URL(originalUrl);
  embedUrl.searchParams.set('embed', 'true');

  // Build iframe HTML for rich embed
  const iframeHtml = `<iframe src="${escapeHtml(embedUrl.toString())}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;

  return {
    version: '1.0',
    type: 'rich',
    title: plan.title,
    provider_name: 'Shipyard',
    provider_url: env.CANONICAL_BASE_URL,
    html: iframeHtml,
    width,
    height,
    thumbnail_url: `${env.CANONICAL_BASE_URL}/og-image.png`,
  };
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
    env,
    maxWidth ? parseInt(maxWidth, 10) : undefined,
    maxHeight ? parseInt(maxHeight, 10) : undefined
  );

  return new Response(JSON.stringify(oembedResponse), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
}

/**
 * Build complete HTML page with OG tags for crawlers.
 * Includes meta refresh to redirect browsers that somehow land here.
 */
function buildOgHtml(plan: DecodedPlan, fullUrl: string, env: Env): string {
  const title = escapeHtml(plan.title);
  const description = escapeHtml(buildDescription(plan));
  const ogImageUrl = `${env.CANONICAL_BASE_URL}/og-image.png`;

  // Build oEmbed discovery URL
  const oembedUrl = `${env.CANONICAL_BASE_URL}/oembed?url=${encodeURIComponent(fullUrl)}&format=json`;

  // Theme colors from the app
  const themeColor = '#0D9488'; // teal-600

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
      background: #0f172a;
      color: #e2e8f0;
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
      color: #94a3b8;
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || '';

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

        const html = buildOgHtml(plan, canonicalUrl.toString(), env);

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
