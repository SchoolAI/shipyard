# Multi-stage Dockerfile for Shipyard services
#
# Stages:
#   - base: Common dependencies, pnpm setup, schema build
#   - registry: MCP server with WebSocket sync
#   - signaling: WebRTC signaling server
#   - web: Vite dev server with HMR
#   - oauth: GitHub OAuth worker (Wrangler)
#   - og-proxy: OpenGraph proxy worker (Wrangler)
#   - daemon: Agent launcher daemon
#
# All services run as root to match production deployment.

# =============================================================================
# BASE STAGE - Common setup for all services
# =============================================================================
# Use Debian-based image (glibc) instead of Alpine (musl)
# @roamhq/wrtc requires glibc 2.32+ and won't work with musl
FROM --platform=linux/amd64 node:22-slim AS base

# Install build tools for native modules (wrtc, etc.)
RUN apt-get update && apt-get install -y python3 make g++ wget && rm -rf /var/lib/apt/lists/*

# Install pnpm via corepack (matches project's packageManager field)
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

WORKDIR /app

# Copy workspace configuration first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY tsconfig.base.json turbo.json biome.json ./

# Copy all package.json files to leverage Docker cache
COPY packages/schema/package.json packages/schema/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/signaling/package.json apps/signaling/
COPY apps/web/package.json apps/web/
COPY apps/daemon/package.json apps/daemon/
COPY apps/github-oauth-worker/package.json apps/github-oauth-worker/
COPY apps/og-proxy-worker/package.json apps/og-proxy-worker/
COPY apps/hook/package.json apps/hook/

# Copy hook scripts for postinstall (prevents install failure)
COPY apps/hook/scripts apps/hook/scripts

# Install all dependencies with native module builds
RUN pnpm install --frozen-lockfile

# Copy source for schema (needed by all services)
COPY packages/schema packages/schema
COPY packages/shared packages/shared

# Build schema package first (dependency for other packages)
RUN pnpm --filter @shipyard/schema build
RUN pnpm --filter @shipyard/shared build

# =============================================================================
# REGISTRY STAGE - MCP Server with WebSocket sync
# =============================================================================
FROM base AS registry

# Copy server source
COPY apps/server apps/server

# Build the server
RUN pnpm --filter @shipyard/server build

EXPOSE 32191

# Health check endpoint
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${REGISTRY_PORT:-32191}/registry || exit 1

# Run the server
CMD ["node", "apps/server/dist/index.js"]

# =============================================================================
# SIGNALING STAGE - WebRTC signaling + OAuth server (Cloudflare Wrangler)
# =============================================================================
FROM base AS signaling

# Copy signaling source (Cloudflare Worker, runs with wrangler)
COPY apps/signaling apps/signaling

EXPOSE 4444

# Health check - signaling server has /health endpoint
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-4444}/health || exit 1

# Run Wrangler dev server
# --local flag runs without Cloudflare account
# --env development uses development environment vars
# Shell form needed for environment variable expansion
CMD pnpm --filter @shipyard/signaling exec wrangler dev --env development --port ${PORT:-4444} --local

# =============================================================================
# WEB STAGE - Vite dev server with HMR
# =============================================================================
FROM base AS web

# Copy web source (full source for HMR support)
COPY apps/web apps/web

EXPOSE 5173

# No health check for Vite - it's a dev server, not a production service
# Vite starts quickly and doesn't need sophisticated health monitoring

# Run Vite dev server
# --host 0.0.0.0 required for Docker networking
# --no-open because we can't open browser from container
CMD ["pnpm", "--filter", "@shipyard/web", "exec", "vite", "--host", "0.0.0.0", "--no-open"]

# =============================================================================
# OAUTH STAGE - GitHub OAuth worker (Cloudflare Wrangler)
# =============================================================================
FROM base AS oauth

# Copy oauth worker source
COPY apps/github-oauth-worker apps/github-oauth-worker

EXPOSE 4445

# No health check - Wrangler dev doesn't expose health endpoints easily
# The worker handles auth flow which is difficult to probe

# Run Wrangler dev server
# --local flag runs without Cloudflare account
# Shell form needed for environment variable expansion
CMD pnpm --filter @shipyard/github-oauth-worker exec wrangler dev --env development --port ${OAUTH_PORT:-4445} --local

# =============================================================================
# OG-PROXY STAGE - OpenGraph proxy worker (Cloudflare Wrangler)
# =============================================================================
FROM base AS og-proxy

# Copy og-proxy worker source
COPY apps/og-proxy-worker apps/og-proxy-worker

EXPOSE 4446

# No health check - same reasoning as oauth stage

# Run Wrangler dev server
# Shell form needed for environment variable expansion
CMD pnpm --filter @shipyard/og-proxy-worker exec wrangler dev --env development --port ${OG_PROXY_PORT:-4446} --local --var UPSTREAM_URL:http://web:${VITE_PORT:-5173} --var CANONICAL_BASE_URL:http://localhost:${OG_PROXY_PORT:-4446}

# =============================================================================
# DAEMON STAGE - Agent launcher daemon
# =============================================================================
FROM base AS daemon

# Copy daemon source
COPY apps/daemon apps/daemon

# Copy claude shim script for spawn logging
COPY scripts/claude-shim.sh /usr/local/bin/claude-shim.sh
RUN chmod +x /usr/local/bin/claude-shim.sh

# Build the daemon
RUN pnpm --filter shipyard build

EXPOSE 56609

# Create log directory for claude-shim
RUN mkdir -p /var/log/shipyard

# Health check - daemon serves WebSocket, hard to check with wget
# Instead, check if the process is running
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD pgrep -f "node.*daemon" || exit 1

# Set shim as Claude executable path (daemon will use this instead of real Claude)
ENV CLAUDE_EXECUTABLE=/usr/local/bin/claude-shim.sh
ENV CLAUDE_SHIM_LOG_DIR=/var/log/shipyard

# Run the daemon
CMD ["node", "apps/daemon/dist/index.js"]
