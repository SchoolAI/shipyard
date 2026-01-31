/**
 * Cloudflare Worker for Open Graph meta tag injection
 *
 * Intercepts requests to Shipyard URLs with ?d= parameter (plan snapshots)
 * and injects dynamic OG meta tags for social media crawlers.
 */

import lzstring from 'lz-string';
import { ImageResponse } from 'workers-og';
import { logger } from './logger.js';

export interface Env {
  ENVIRONMENT: 'development' | 'production';
  UPSTREAM_URL: string;
  CANONICAL_BASE_URL: string;
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
}

const PLAN_STATUS_VALUES = [
  'draft',
  'pending_review',
  'changes_requested',
  'in_progress',
  'completed',
] as const;

type PlanStatus = (typeof PLAN_STATUS_VALUES)[number];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlanStatus(value: unknown): value is PlanStatus {
  return typeof value === 'string' && PLAN_STATUS_VALUES.some((status) => status === value);
}

function isDeliverable(value: unknown): value is { text: string; linkedArtifactId?: string } {
  if (!isRecord(value)) return false;
  if (typeof value.text !== 'string') return false;
  if (value.linkedArtifactId !== undefined && typeof value.linkedArtifactId !== 'string')
    return false;
  return true;
}

function decodePlan(encoded: string): DecodedPlan | null {
  try {
    const json = lzstring.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;

    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed)) return null;

    if (typeof parsed.v !== 'number') return null;
    if (typeof parsed.id !== 'string') return null;
    if (typeof parsed.title !== 'string') return null;
    if (!isPlanStatus(parsed.status)) return null;

    const plan: DecodedPlan = {
      v: parsed.v,
      id: parsed.id,
      title: parsed.title,
      status: parsed.status,
    };

    if (typeof parsed.repo === 'string') {
      plan.repo = parsed.repo;
    }

    if (typeof parsed.pr === 'number') {
      plan.pr = parsed.pr;
    }

    if (Array.isArray(parsed.content)) {
      plan.content = parsed.content;
    }

    if (Array.isArray(parsed.deliverables)) {
      const validDeliverables = parsed.deliverables.filter(isDeliverable);
      if (validDeliverables.length > 0) {
        plan.deliverables = validDeliverables;
      }
    }

    return plan;
  } catch (error) {
    logger.error({ error }, 'Failed to decode plan');
    return null;
  }
}

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

function extractTextFromContent(content: unknown[]): string[] {
  const texts: string[] = [];
  for (const item of content) {
    if (isRecord(item) && typeof item.text === 'string') {
      texts.push(item.text);
    }
  }
  return texts;
}

function collectBlockText(block: unknown, textParts: string[]): void {
  if (!isRecord(block)) return;

  if (Array.isArray(block.content)) {
    textParts.push(...extractTextFromContent(block.content));
  }

  if (Array.isArray(block.children)) {
    for (const child of block.children) {
      collectBlockText(child, textParts);
    }
  }
}

function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > maxLength * 0.7 ? lastSpace : maxLength;
  return `${truncated.slice(0, cutPoint)}…`;
}

function extractTextFromBlocks(blocks: unknown[], maxLength: number = 160): string {
  const textParts: string[] = [];

  for (const block of blocks) {
    collectBlockText(block, textParts);
    if (textParts.join(' ').length > maxLength * 2) break;
  }

  const fullText = textParts.join(' ').trim();
  return truncateAtWordBoundary(fullText, maxLength);
}

function buildDescription(plan: DecodedPlan): string {
  const parts: string[] = [];

  parts.push(`${getStatusEmoji(plan.status)} ${getStatusLabel(plan.status)}`);

  if (plan.deliverables && plan.deliverables.length > 0) {
    const total = plan.deliverables.length;
    const completed = plan.deliverables.filter((d) => d.linkedArtifactId).length;
    parts.push(`${completed}/${total} deliverable${total === 1 ? '' : 's'}`);
  }

  if (plan.repo && plan.pr) {
    parts.push(`${plan.repo}#${plan.pr}`);
  } else if (plan.repo) {
    parts.push(plan.repo);
  }

  let description = parts.join(' · ');

  if (plan.content && Array.isArray(plan.content)) {
    const contentText = extractTextFromBlocks(plan.content, 100);
    if (contentText) {
      description += ` — ${contentText}`;
    }
  }

  if (description.length > 200) {
    description = `${description.slice(0, 197)}…`;
  }

  return description;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

const OEMBED_DEFAULT_WIDTH = 600;
const OEMBED_DEFAULT_HEIGHT = 400;

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

function buildOEmbedResponse(
  plan: DecodedPlan,
  _originalUrl: string,
  encodedPlan: string,
  env: Env,
  maxWidth?: number,
  maxHeight?: number
): OEmbedResponse {
  const width = maxWidth ? Math.min(maxWidth, OEMBED_DEFAULT_WIDTH) : OEMBED_DEFAULT_WIDTH;
  const height = maxHeight ? Math.min(maxHeight, OEMBED_DEFAULT_HEIGHT) : OEMBED_DEFAULT_HEIGHT;

  const embedUrl = new URL(env.CANONICAL_BASE_URL);
  embedUrl.searchParams.set('d', encodedPlan);

  const iframeHtml = `<iframe src="${escapeHtml(embedUrl.toString())}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;

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

const OEMBED_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

const THEME = {
  pictonBlue: {
    400: '#42cde5',
    500: '#42cde5',
    600: '#42cde5',
  },
  orange: {
    500: '#cc5113',
    600: '#a63f0d',
  },
  slate: {
    200: '#d6e1e0',
    400: '#748fb0',
    500: '#4a5b74',
    700: '#4a5b74',
    800: '#13192e',
    900: '#13192e',
    950: '#13192e',
  },
  accent: '#cb9380',
  success: '#10b981',
  warning: '#cc5113',
  danger: '#a51100',
} as const;

function getStatusColor(status: PlanStatus): string {
  switch (status) {
    case 'draft':
      return THEME.slate[500];
    case 'pending_review':
      return THEME.warning;
    case 'changes_requested':
      return THEME.danger;
    case 'in_progress':
      return THEME.accent;
    case 'completed':
      return THEME.success;
  }
}

function truncateTitle(title: string, maxLength: number = OG_DESIGN.title.maxLength): string {
  if (title.length <= maxLength) return title;
  const truncated = title.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > maxLength * 0.6 ? lastSpace : maxLength;
  return `${truncated.slice(0, cutPoint)}...`;
}

const OG_DESIGN = {
  logo: {
    size: 120,
    borderRadius: 20,
  },
  title: {
    fontSize: 64,
    maxLength: 70,
  },
  status: {
    height: 48,
    fontSize: 28,
    dotSize: 14,
    paddingV: 12,
    paddingH: 28,
    borderRadius: 24,
  },
  progress: {
    height: 24,
    fontSize: 40,
    labelSize: 28,
    borderRadius: 12,
  },
  spacing: {
    padding: 64,
    sectionGap: 48,
  },
} as const;

const STATIC_ASSETS_URL = 'https://schoolai.github.io/shipyard';

/**
 * workers-og cannot fetch from localhost in wrangler dev mode,
 * so we always use the production URL for the logo.
 */
function buildLogoHtml(): string {
  const logoUrl = `${STATIC_ASSETS_URL}/icon-512.png`;
  return `<img src="${logoUrl}" width="${OG_DESIGN.logo.size}" height="${OG_DESIGN.logo.size}" style="display: flex; border-radius: ${OG_DESIGN.logo.borderRadius}px;" />`;
}

function buildOgImageHtml(plan: DecodedPlan): string {
  const title = escapeHtml(truncateTitle(plan.title));
  const statusLabel = getStatusLabel(plan.status);
  const statusColor = getStatusColor(plan.status);

  const total = plan.deliverables?.length ?? 0;
  const completed = plan.deliverables?.filter((d) => d.linkedArtifactId).length ?? 0;
  const filledPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const pad = OG_DESIGN.spacing.padding;
  const sectionGap = OG_DESIGN.spacing.sectionGap;

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

  const statusPill = `
    <div style="display: flex; align-items: center; background-color: ${THEME.slate[800]}; border-radius: ${OG_DESIGN.status.borderRadius}px; padding: ${OG_DESIGN.status.paddingV}px ${OG_DESIGN.status.paddingH}px;">
      <div style="display: flex; width: ${OG_DESIGN.status.dotSize}px; height: ${OG_DESIGN.status.dotSize}px; background-color: ${statusColor}; border-radius: ${OG_DESIGN.status.dotSize / 2}px; margin-right: 16px;"></div>
      <span style="font-size: ${OG_DESIGN.status.fontSize}px; font-weight: 600; color: ${THEME.slate[200]};">${statusLabel}</span>
    </div>
  `;

  return `<div style="display: flex; flex-direction: column; width: 100vw; height: 100vh; background-color: ${THEME.slate[900]}; font-family: sans-serif; color: white;">
  <div style="display: flex; width: 100%; height: 8px; background-color: ${THEME.pictonBlue[500]};"></div>

  <div style="display: flex; flex-direction: column; flex: 1; padding: ${pad}px;">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: ${sectionGap}px;">
      <div style="display: flex; align-items: center;">
        ${buildLogoHtml()}
        <span style="font-size: 40px; font-weight: 700; color: ${THEME.slate[200]}; margin-left: 20px;">Shipyard</span>
      </div>
      <div style="display: flex;">
        ${statusPill}
      </div>
    </div>

    <div style="display: flex; flex: 1; align-items: center;">
      <span style="font-size: ${OG_DESIGN.title.fontSize}px; font-weight: 700; color: white; line-height: 1.2;">${title}</span>
    </div>

    ${progressSection}
  </div>
</div>`;
}

async function generateCacheKey(plan: DecodedPlan, baseUrl: string): Promise<string> {
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

  const encoder = new TextEncoder();
  const data = encoder.encode(cacheData);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `${baseUrl}/og-image-cache/${hashHex}.png`;
}

/**
 * wrangler dev has issues with caches.default causing requests to hang,
 * so cache is only enabled in production.
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
      logger.warn({ error: cacheError }, 'Cache lookup failed, generating fresh image');
    }
  }

  logger.info({ planId: plan.id, title: plan.title }, 'Generating OG image');

  const html = buildOgImageHtml(plan);

  if (!useCache) {
    return new ImageResponse(html, {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    });
  }

  try {
    const cache = caches.default;
    const cacheKey = await generateCacheKey(plan, env.CANONICAL_BASE_URL);
    const cacheRequest = new Request(cacheKey);

    const cachedResponse = await cache.match(cacheRequest);
    if (cachedResponse) {
      logger.debug({ cacheKey }, 'Serving OG image from cache (second check)');
      return cachedResponse;
    }

    const imageResponse = new ImageResponse(html, {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    });

    /** Clone before consuming - Response body can only be read once */
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

function handleOEmbedRequest(url: URL, env: Env): Response {
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

  const maxWidth = url.searchParams.get('maxwidth');
  const maxHeight = url.searchParams.get('maxheight');

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
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function buildOgHtml(plan: DecodedPlan, fullUrl: string, encodedPlan: string, env: Env): string {
  const title = escapeHtml(plan.title);
  const description = escapeHtml(buildDescription(plan));
  const ogImageUrl = `${env.CANONICAL_BASE_URL}/og-image?d=${encodeURIComponent(encodedPlan)}`;

  const oembedUrl = `${env.CANONICAL_BASE_URL}/oembed?url=${encodeURIComponent(fullUrl)}&format=json`;

  const themeColor = THEME.pictonBlue[600];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${title} - Shipyard</title>
  <meta name="title" content="${title} - Shipyard" />
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />

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

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${escapeHtml(fullUrl)}" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${ogImageUrl}" />
  <meta name="twitter:image:alt" content="${title}" />

  <link rel="alternate" type="application/json+oembed" href="${escapeHtml(oembedUrl)}" title="${title}" />

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
    if (env.LOG_LEVEL) {
      logger.setLevel(env.LOG_LEVEL);
    }

    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || '';

    if (request.method === 'OPTIONS' && url.pathname === '/oembed') {
      return new Response(null, {
        status: 204,
        headers: OEMBED_CORS_HEADERS,
      });
    }

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

    if (url.pathname === '/og-image') {
      logger.info({ search: url.search }, 'OG image request received');
      return handleOgImageRequest(url, env, ctx);
    }

    if (url.pathname === '/oembed') {
      logger.info({ search: url.search }, 'oEmbed request received');
      return handleOEmbedRequest(url, env);
    }

    const encodedPlan = url.searchParams.get('d');
    const shouldInjectOg = isCrawler(userAgent) && encodedPlan;

    if (shouldInjectOg) {
      logger.info(
        { userAgent, planParam: encodedPlan?.slice(0, 50) },
        'Crawler detected, injecting OG tags'
      );

      const plan = decodePlan(encodedPlan);
      if (plan) {
        const canonicalUrl = new URL(env.CANONICAL_BASE_URL);
        canonicalUrl.search = url.search;

        const html = buildOgHtml(plan, canonicalUrl.toString(), encodedPlan, env);

        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      logger.warn(
        { encodedPlan: encodedPlan.slice(0, 100) },
        'Failed to decode plan, proxying to upstream'
      );
    }

    const upstreamUrl = new URL(env.UPSTREAM_URL);
    upstreamUrl.pathname = url.pathname;
    upstreamUrl.search = url.search;

    logger.debug({ upstream: upstreamUrl.toString() }, 'Proxying to upstream');

    const response = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers: request.headers,
    });

    const newHeaders = new Headers(response.headers);

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  },
};
