#!/usr/bin/env node
import {
  getGitHubUsername,
  getRepositoryFullName,
  githubConfig
} from "./chunk-7GPZDCWI.js";
import {
  assertNever,
  getSessionIdByPlanId,
  getSessionState,
  getSessionStateByPlanId,
  isSessionStateApproved,
  isSessionStateApprovedAwaitingToken,
  isSessionStateReviewed,
  isSessionStateSynced,
  setSessionState,
  startPeriodicCleanup
} from "./chunk-EBNL5ZX7.js";
import {
  InputRequestManager
} from "./chunk-QGMQUJWG.js";
import {
  ArtifactSchema,
  DeliverableSchema,
  GitHubPRResponseSchema,
  InputRequestSchema,
  LinkedPRSchema,
  PLAN_INDEX_DOC_NAME,
  PRReviewCommentSchema,
  PlanEventSchema,
  PlanSnapshotSchema,
  PlanStatusValues,
  ROUTES,
  YDOC_KEYS,
  a2aToClaudeCode,
  addArtifact,
  addConversationVersion,
  addDeliverable,
  addPRReviewComment,
  addSnapshot,
  appRouter,
  createInitialConversationVersion,
  createLinkedPR,
  createPlanSnapshot,
  createPlanUrlWithHistory,
  createUserResolver,
  extractDeliverables,
  extractMentions,
  extractTextFromCommentBody,
  formatAsClaudeCodeJSONL,
  formatDeliverablesForLLM,
  formatThreadsForLLM,
  getArtifacts,
  getDeliverables,
  getLinkedPRs,
  getPlanMetadata,
  getPlanMetadataWithValidation,
  getSnapshots,
  initPlanMetadata,
  linkArtifactToDeliverable,
  linkPR,
  logPlanEvent,
  parseClaudeCodeOrigin,
  parseThreads,
  setAgentPresence,
  setPlanIndexEntry,
  setPlanMetadata,
  touchPlanIndexEntry,
  transitionPlanStatus
} from "./chunk-U3BX4EMY.js";
import {
  loadEnv,
  logger
} from "./chunk-GSGLHRWX.js";
import "./chunk-JSBRDJBE.js";

// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from "@modelcontextprotocol/sdk/types.js";

// src/hub-client.ts
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
var providers = /* @__PURE__ */ new Map();
var docs = /* @__PURE__ */ new Map();
var hubPort = null;
var initialized = false;
async function initHubClient(port) {
  if (initialized) {
    logger.warn("Hub client already initialized");
    return;
  }
  hubPort = port;
  initialized = true;
  logger.info({ hubPort }, "Hub client initialized, will connect to registry hub");
}
function isHubClientInitialized() {
  return initialized;
}
async function getOrCreateDoc(docName) {
  const existing = docs.get(docName);
  if (existing) {
    return existing;
  }
  if (!initialized || !hubPort) {
    throw new Error("Hub client not initialized. Call initHubClient() first.");
  }
  const doc = new Y.Doc();
  docs.set(docName, doc);
  const hubUrl = `ws://localhost:${hubPort}`;
  const provider = new WebsocketProvider(hubUrl, docName, doc, {
    connect: true,
    maxBackoffTime: 2500
  });
  providers.set(docName, provider);
  await new Promise((resolve3, reject) => {
    if (provider.synced) {
      logger.debug({ docName }, "Provider already synced");
      resolve3();
      return;
    }
    const onSync = (isSynced) => {
      if (isSynced) {
        logger.debug({ docName }, "Provider synced via sync event");
        provider.off("sync", onSync);
        clearTimeout(timeoutId);
        resolve3();
      }
    };
    provider.on("sync", onSync);
    const timeoutId = setTimeout(() => {
      if (!provider.synced) {
        provider.off("sync", onSync);
        logger.error({ docName, synced: provider.synced }, "Hub sync timeout - cannot proceed");
        reject(new Error(`Failed to sync document '${docName}' with hub within 10 seconds`));
      }
    }, 1e4);
  });
  logger.info({ docName, hubUrl }, "Connected to hub for document sync");
  return doc;
}
async function hasActiveConnections(planId) {
  if (!hubPort) return false;
  try {
    const res = await fetch(`http://localhost:${hubPort}${ROUTES.PLAN_HAS_CONNECTIONS(planId)}`, {
      signal: AbortSignal.timeout(500)
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.hasConnections;
  } catch {
    return false;
  }
}

// src/registry-server.ts
import { mkdirSync, readFileSync, unlinkSync } from "fs";
import { readFile, unlink, writeFile as writeFile2 } from "fs/promises";
import http from "http";
import { homedir as homedir3 } from "os";
import { join as join3, resolve, sep } from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { WebSocketServer } from "ws";
import { LeveldbPersistence } from "y-leveldb";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y2 from "yjs";

// src/config/env/registry.ts
import { homedir } from "os";
import { join } from "path";

// ../../packages/shared/dist/registry-config.mjs
var DEFAULT_REGISTRY_PORTS = [32191, 32192];

// src/config/env/registry.ts
import { z } from "zod";
var schema = z.object({
  REGISTRY_PORT: z.string().optional().transform((val) => {
    if (!val) return DEFAULT_REGISTRY_PORTS;
    const port = Number.parseInt(val, 10);
    if (Number.isNaN(port)) {
      throw new Error(`REGISTRY_PORT must be a valid number, got: ${val}`);
    }
    return [port];
  }),
  SHIPYARD_STATE_DIR: z.string().optional().default(() => join(homedir(), ".shipyard"))
});
var registryConfig = loadEnv(schema);

// src/conversation-handlers.ts
import { mkdir, writeFile } from "fs/promises";
import { homedir as homedir2 } from "os";
import { join as join2 } from "path";
import { nanoid } from "nanoid";
async function importConversationHandler(input, ctx) {
  const { a2aMessages, meta } = input;
  if (!a2aMessages || !Array.isArray(a2aMessages)) {
    return {
      success: false,
      error: "Missing or invalid a2aMessages"
    };
  }
  if (a2aMessages.length === 0) {
    return {
      success: false,
      error: "a2aMessages array is empty"
    };
  }
  try {
    const sessionId = nanoid();
    const claudeMessages = a2aToClaudeCode(a2aMessages, sessionId);
    const jsonl = formatAsClaudeCodeJSONL(claudeMessages);
    const projectName = meta?.planId ? `shipyard-${meta.planId.slice(0, 8)}` : process.cwd().split("/").pop() || "shipyard";
    const projectPath = join2(homedir2(), ".claude", "projects", projectName);
    await mkdir(projectPath, { recursive: true });
    const transcriptPath = join2(projectPath, `${sessionId}.jsonl`);
    await writeFile(transcriptPath, jsonl, "utf-8");
    ctx.logger.info(
      {
        sessionId,
        transcriptPath,
        messageCount: claudeMessages.length,
        sourcePlatform: meta?.sourcePlatform
      },
      "Created Claude Code session from imported conversation"
    );
    return {
      success: true,
      sessionId,
      transcriptPath,
      messageCount: claudeMessages.length
    };
  } catch (error) {
    ctx.logger.error({ error }, "Failed to import conversation");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
function createConversationHandlers() {
  return {
    importConversation: (input, ctx) => importConversationHandler(input, ctx)
  };
}

// src/crdt-validation.ts
var corruptionState = /* @__PURE__ */ new Map();
var CORRUPTION_REPORT_INTERVAL_MS = 5 * 60 * 1e3;
function shouldReportCorruption(planId, key) {
  const state = corruptionState.get(planId);
  const now = Date.now();
  if (!state) {
    corruptionState.set(planId, {
      lastReported: now,
      corruptedKeys: /* @__PURE__ */ new Set([key])
    });
    return true;
  }
  if (!state.corruptedKeys.has(key)) {
    state.corruptedKeys.add(key);
    state.lastReported = now;
    return true;
  }
  if (now - state.lastReported > CORRUPTION_REPORT_INTERVAL_MS) {
    state.lastReported = now;
    return true;
  }
  return false;
}
function clearCorruptionState(planId, key) {
  const state = corruptionState.get(planId);
  if (state) {
    state.corruptedKeys.delete(key);
    if (state.corruptedKeys.size === 0) {
      corruptionState.delete(planId);
    }
  }
}
function validateMetadata(doc, planId) {
  const result = getPlanMetadataWithValidation(doc);
  if (result.success) {
    clearCorruptionState(planId, YDOC_KEYS.METADATA);
    return { key: YDOC_KEYS.METADATA, valid: true };
  }
  return {
    key: YDOC_KEYS.METADATA,
    valid: false,
    errors: [result.error]
  };
}
function validateArray(doc, key, schema3) {
  const array = doc.getArray(key);
  const items = array.toJSON();
  if (items.length === 0) {
    return { key, valid: true, totalItems: 0, invalidItems: 0 };
  }
  const errors = [];
  let invalidCount = 0;
  for (let i = 0; i < items.length; i++) {
    const result = schema3.safeParse(items[i]);
    if (!result.success) {
      invalidCount++;
      errors.push(`Item ${i}: ${result.error?.message ?? "Unknown error"}`);
    }
  }
  return {
    key,
    valid: invalidCount === 0,
    totalItems: items.length,
    invalidItems: invalidCount,
    errors: errors.length > 0 ? errors : void 0
  };
}
function logCorruption(planId, result, origin) {
  if (!shouldReportCorruption(planId, result.key)) {
    return;
  }
  logger.error(
    {
      planId,
      key: result.key,
      totalItems: result.totalItems,
      invalidItems: result.invalidItems,
      errors: result.errors?.slice(0, 5),
      // Limit to first 5 errors
      origin: typeof origin === "string" ? origin : void 0
    },
    "CRDT corruption detected from peer sync"
  );
}
function createArrayObserver(planId, key, schema3) {
  return (event, transaction) => {
    const doc = event.target.doc;
    if (!doc) return;
    const result = validateArray(doc, key, schema3);
    if (!result.valid) {
      logCorruption(planId, result, transaction.origin);
    } else {
      clearCorruptionState(planId, key);
    }
  };
}
function attachCRDTValidation(planId, doc) {
  doc.getMap(YDOC_KEYS.METADATA).observe((_event, transaction) => {
    const result = validateMetadata(doc, planId);
    if (!result.valid) {
      logCorruption(planId, result, transaction.origin);
    } else {
      clearCorruptionState(planId, YDOC_KEYS.METADATA);
    }
  });
  doc.getArray(YDOC_KEYS.ARTIFACTS).observe(createArrayObserver(planId, YDOC_KEYS.ARTIFACTS, ArtifactSchema));
  doc.getArray(YDOC_KEYS.DELIVERABLES).observe(createArrayObserver(planId, YDOC_KEYS.DELIVERABLES, DeliverableSchema));
  doc.getArray(YDOC_KEYS.LINKED_PRS).observe(createArrayObserver(planId, YDOC_KEYS.LINKED_PRS, LinkedPRSchema));
  doc.getArray(YDOC_KEYS.EVENTS).observe(createArrayObserver(planId, YDOC_KEYS.EVENTS, PlanEventSchema));
  doc.getArray(YDOC_KEYS.SNAPSHOTS).observe(createArrayObserver(planId, YDOC_KEYS.SNAPSHOTS, PlanSnapshotSchema));
  doc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS).observe(
    createArrayObserver(
      planId,
      YDOC_KEYS.PR_REVIEW_COMMENTS,
      PRReviewCommentSchema
    )
  );
  doc.getArray(YDOC_KEYS.INPUT_REQUESTS).observe(
    createArrayObserver(planId, YDOC_KEYS.INPUT_REQUESTS, InputRequestSchema)
  );
  logger.debug({ planId }, "CRDT validation observers attached");
}

// src/github-artifacts.ts
import { Octokit } from "@octokit/rest";
var ARTIFACTS_BRANCH = "plan-artifacts";
function parseRepoString(repo) {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repoName: parts[1] };
}
function isArtifactsEnabled() {
  return githubConfig.SHIPYARD_ARTIFACTS;
}
function resolveGitHubToken() {
  return githubConfig.GITHUB_TOKEN;
}
function isAuthError(error) {
  const status = error.status;
  return status === 401 || status === 403;
}
var GitHubAuthError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "GitHubAuthError";
  }
};
async function withTokenRetry(operation) {
  try {
    return await operation();
  } catch (error) {
    if (isAuthError(error)) {
      logger.info("GitHub auth error, checking token and retrying...");
      const newToken = resolveGitHubToken();
      if (!newToken) {
        throw new GitHubAuthError(
          "GitHub token expired and could not be refreshed.\n\nTo fix this, run in your terminal:\n  gh auth login\n\nOr set GITHUB_TOKEN environment variable in your MCP config."
        );
      }
      try {
        return await operation();
      } catch (retryError) {
        if (isAuthError(retryError)) {
          throw new GitHubAuthError(
            "GitHub authentication failed after token refresh.\n\nYour token may not have the required permissions.\nRun: gh auth login --scopes repo\n\nOr check your GITHUB_TOKEN has repo access."
          );
        }
        throw retryError;
      }
    }
    throw error;
  }
}
function getOctokit() {
  const token = resolveGitHubToken();
  if (!token) {
    return null;
  }
  return new Octokit({ auth: token });
}
function isGitHubConfigured() {
  return !!resolveGitHubToken();
}
async function ensureArtifactsBranch(repo) {
  return withTokenRetry(async () => {
    const octokit = getOctokit();
    if (!octokit) {
      throw new Error("GITHUB_TOKEN not set");
    }
    const { owner, repoName } = parseRepoString(repo);
    try {
      await octokit.repos.getBranch({
        owner,
        repo: repoName,
        branch: ARTIFACTS_BRANCH
      });
      logger.debug({ repo }, "Artifacts branch exists");
      return;
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
    logger.info({ repo }, "Creating artifacts branch");
    try {
      const { data: repoData } = await octokit.repos.get({ owner, repo: repoName });
      const defaultBranch = repoData.default_branch;
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${defaultBranch}`
      });
      await octokit.git.createRef({
        owner,
        repo: repoName,
        ref: `refs/heads/${ARTIFACTS_BRANCH}`,
        sha: refData.object.sha
      });
      logger.info({ repo, branch: ARTIFACTS_BRANCH }, "Created artifacts branch");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to create "${ARTIFACTS_BRANCH}" branch. Please create it manually:

  git checkout --orphan ${ARTIFACTS_BRANCH}
  git rm -rf .
  git commit --allow-empty -m "Initialize plan artifacts"
  git push -u origin ${ARTIFACTS_BRANCH}
  git checkout main

Error: ${message}`
      );
    }
  });
}
async function uploadArtifact(params) {
  return withTokenRetry(async () => {
    const octokit = getOctokit();
    if (!octokit) {
      throw new Error("GITHUB_TOKEN not set");
    }
    const { repo, planId, filename, content } = params;
    const { owner, repoName } = parseRepoString(repo);
    const path = `plans/${planId}/${filename}`;
    await ensureArtifactsBranch(repo);
    let existingSha;
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path,
        ref: ARTIFACTS_BRANCH
      });
      if (!Array.isArray(data) && data.type === "file") {
        existingSha = data.sha;
      }
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path,
      message: `Add artifact: ${filename}`,
      content,
      branch: ARTIFACTS_BRANCH,
      sha: existingSha
    });
    const url = `https://raw.githubusercontent.com/${repo}/${ARTIFACTS_BRANCH}/${path}`;
    logger.info({ repo, path, url }, "Artifact uploaded");
    return url;
  });
}

// src/hook-handlers.ts
import { ServerBlockNoteEditor } from "@blocknote/server-util";

// ../../packages/shared/dist/index.mjs
import { createHash, randomBytes } from "crypto";
function computeHash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}
function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
var APPROVAL_LONG_POLL_TIMEOUT_MS = 1800 * 1e3;
var DEFAULT_TRPC_TIMEOUT_MS = 10 * 1e3;

// src/hook-handlers.ts
import { TRPCError } from "@trpc/server";
import { nanoid as nanoid2 } from "nanoid";
import open from "open";

// src/config/env/web.ts
import { z as z2 } from "zod";
var schema2 = z2.object({
  SHIPYARD_WEB_URL: z2.string().url().default("http://localhost:5173")
});
var webConfig = loadEnv(schema2);

// src/hook-handlers.ts
async function parseMarkdownToBlocks(markdown) {
  const editor = ServerBlockNoteEditor.create();
  return await editor.tryParseMarkdownToBlocks(markdown);
}
function extractTitleFromBlocks(blocks) {
  const UNTITLED = "Untitled Plan";
  const firstBlock = blocks[0];
  if (!firstBlock) return UNTITLED;
  const content = firstBlock.content;
  if (!content || !Array.isArray(content) || content.length === 0) {
    return UNTITLED;
  }
  const firstContent = content[0];
  if (!firstContent || typeof firstContent !== "object" || !("text" in firstContent)) {
    return UNTITLED;
  }
  const text = firstContent.text;
  if (firstBlock.type === "heading") {
    return text;
  }
  return text.slice(0, 50);
}
async function createSessionHandler(input, ctx) {
  const existingSession = getSessionState(input.sessionId);
  if (existingSession) {
    const webUrl2 = webConfig.SHIPYARD_WEB_URL;
    const url2 = `${webUrl2}/plan/${existingSession.planId}`;
    ctx.logger.info(
      { planId: existingSession.planId, sessionId: input.sessionId },
      "Returning existing session (idempotent)"
    );
    return { planId: existingSession.planId, url: url2 };
  }
  const planId = nanoid2();
  const now = Date.now();
  ctx.logger.info(
    { planId, sessionId: input.sessionId, agentType: input.agentType },
    "Creating plan from hook"
  );
  const PLAN_IN_PROGRESS = "Plan in progress...";
  const ownerId = await getGitHubUsername();
  ctx.logger.info({ ownerId }, "GitHub username for plan ownership");
  const repo = getRepositoryFullName() || void 0;
  if (repo) {
    ctx.logger.info({ repo }, "Auto-detected repository from current directory");
  }
  const ydoc = await ctx.getOrCreateDoc(planId);
  const origin = parseClaudeCodeOrigin(input.metadata) || {
    platform: "claude-code",
    sessionId: input.sessionId,
    transcriptPath: ""
  };
  initPlanMetadata(ydoc, {
    id: planId,
    title: PLAN_IN_PROGRESS,
    ownerId,
    repo,
    origin
  });
  setAgentPresence(ydoc, {
    agentType: input.agentType ?? "claude-code",
    sessionId: input.sessionId,
    connectedAt: now,
    lastSeenAt: now
  });
  if (origin && origin.platform === "claude-code") {
    const creator = typeof input.metadata?.ownerId === "string" ? input.metadata.ownerId : "unknown";
    const initialVersion = createInitialConversationVersion({
      versionId: nanoid2(),
      creator,
      platform: origin.platform,
      sessionId: origin.sessionId,
      messageCount: 0,
      createdAt: now
    });
    addConversationVersion(ydoc, initialVersion);
    ctx.logger.info(
      { planId, versionId: initialVersion.versionId },
      "Added initial conversation version"
    );
  }
  const indexDoc = await ctx.getOrCreateDoc(PLAN_INDEX_DOC_NAME);
  setPlanIndexEntry(indexDoc, {
    id: planId,
    title: PLAN_IN_PROGRESS,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    ownerId,
    deleted: false
  });
  const webUrl = webConfig.SHIPYARD_WEB_URL;
  const url = `${webUrl}/plan/${planId}`;
  ctx.logger.info({ url }, "Plan URL generated");
  setSessionState(input.sessionId, {
    lifecycle: "created",
    planId,
    createdAt: now,
    lastSyncedAt: now
  });
  ctx.logger.info({ sessionId: input.sessionId, planId }, "Session registered in registry");
  if (await hasActiveConnections2(PLAN_INDEX_DOC_NAME)) {
    indexDoc.getMap("navigation").set("target", planId);
    ctx.logger.info({ url, planId }, "Browser already connected, navigating via CRDT");
  } else {
    await open(url);
    ctx.logger.info({ url }, "Browser launched by server");
  }
  return { planId, url };
}
async function updateContentHandler(planId, input, ctx) {
  ctx.logger.info(
    { planId, contentLength: input.content.length },
    "Updating plan content from hook"
  );
  const ydoc = await ctx.getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Plan not found"
    });
  }
  const blocks = await parseMarkdownToBlocks(input.content);
  const title = extractTitleFromBlocks(blocks);
  const now = Date.now();
  const editor = ServerBlockNoteEditor.create();
  ydoc.transact(() => {
    const fragment = ydoc.getXmlFragment("document");
    while (fragment.length > 0) {
      fragment.delete(0, 1);
    }
    editor.blocksToYXmlFragment(blocks, fragment);
    const deliverables = extractDeliverables(blocks);
    for (const deliverable of deliverables) {
      addDeliverable(ydoc, deliverable);
    }
    if (deliverables.length > 0) {
      ctx.logger.info({ count: deliverables.length }, "Deliverables extracted from hook content");
    }
  });
  setPlanMetadata(ydoc, {
    title
  });
  const indexDoc = await ctx.getOrCreateDoc(PLAN_INDEX_DOC_NAME);
  if (metadata.ownerId) {
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title,
      status: metadata.status,
      createdAt: metadata.createdAt ?? now,
      updatedAt: now,
      ownerId: metadata.ownerId,
      deleted: false
    });
  } else {
    ctx.logger.warn({ planId }, "Cannot update plan index: missing ownerId");
  }
  const sessionId = getSessionIdByPlanId(planId);
  if (sessionId) {
    const session = getSessionStateByPlanId(planId);
    if (session) {
      const contentHash = computeHash(input.content);
      switch (session.lifecycle) {
        case "created":
        case "approved_awaiting_token":
          setSessionState(sessionId, {
            ...session,
            planFilePath: input.filePath
          });
          break;
        case "synced":
        case "approved":
        case "reviewed":
          setSessionState(sessionId, {
            ...session,
            contentHash,
            planFilePath: input.filePath
          });
          break;
        default:
          assertNever(session);
      }
      ctx.logger.info(
        { planId, sessionId, contentHash, lifecycle: session.lifecycle },
        "Updated session registry with content hash"
      );
    }
  }
  ctx.logger.info({ planId, title, blockCount: blocks.length }, "Plan content updated");
  return { success: true, updatedAt: now };
}
async function getReviewStatusHandler(planId, ctx) {
  const ydoc = await ctx.getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Plan not found"
    });
  }
  switch (metadata.status) {
    case "draft":
      return { status: "draft" };
    case "pending_review":
      return {
        status: "pending_review",
        reviewRequestId: metadata.reviewRequestId
      };
    case "changes_requested": {
      const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
      const threadsData = threadsMap.toJSON();
      const threads = parseThreads(threadsData);
      const feedback = threads.map((thread) => ({
        threadId: thread.id,
        blockId: thread.selectedText,
        comments: thread.comments.map((c) => ({
          author: c.userId ?? "Reviewer",
          content: typeof c.body === "string" ? c.body : JSON.stringify(c.body),
          createdAt: c.createdAt ?? Date.now()
        }))
      }));
      return {
        status: "changes_requested",
        reviewedAt: metadata.reviewedAt,
        reviewedBy: metadata.reviewedBy,
        reviewComment: metadata.reviewComment,
        feedback: feedback.length > 0 ? feedback : void 0
      };
    }
    case "in_progress":
      return {
        status: "in_progress",
        reviewedAt: metadata.reviewedAt,
        reviewedBy: metadata.reviewedBy
      };
    case "completed":
      return {
        status: "completed",
        completedAt: metadata.completedAt,
        completedBy: metadata.completedBy,
        snapshotUrl: metadata.snapshotUrl
      };
    default:
      assertNever(metadata);
  }
}
async function updatePresenceHandler(planId, input, ctx) {
  const ydoc = await ctx.getOrCreateDoc(planId);
  const now = Date.now();
  setAgentPresence(ydoc, {
    agentType: input.agentType,
    sessionId: input.sessionId,
    connectedAt: now,
    lastSeenAt: now
  });
  return { success: true };
}
async function setSessionTokenHandler(planId, sessionTokenHash, ctx) {
  ctx.logger.info({ planId }, "Setting session token from hook");
  const ydoc = await ctx.getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Plan not found"
    });
  }
  setPlanMetadata(ydoc, {
    sessionTokenHash
  });
  const webUrl = webConfig.SHIPYARD_WEB_URL;
  const url = `${webUrl}/plan/${planId}`;
  const session = getSessionStateByPlanId(planId);
  const sessionId = getSessionIdByPlanId(planId);
  if (session && sessionId) {
    switch (session.lifecycle) {
      case "created":
        setSessionState(sessionId, {
          lifecycle: "synced",
          planId: session.planId,
          planFilePath: session.planFilePath,
          createdAt: session.createdAt,
          lastSyncedAt: session.lastSyncedAt,
          contentHash: "",
          sessionToken: sessionTokenHash,
          url
        });
        ctx.logger.info({ planId, sessionId }, "Transitioned session to synced state");
        break;
      case "approved_awaiting_token":
        setSessionState(sessionId, {
          lifecycle: "approved",
          planId: session.planId,
          planFilePath: session.planFilePath,
          createdAt: session.createdAt,
          lastSyncedAt: session.lastSyncedAt,
          contentHash: "",
          sessionToken: sessionTokenHash,
          url,
          approvedAt: session.approvedAt,
          deliverables: session.deliverables,
          reviewComment: session.reviewComment,
          reviewedBy: session.reviewedBy
        });
        ctx.logger.info(
          { planId, sessionId },
          "Transitioned session from approved_awaiting_token to approved"
        );
        break;
      case "synced":
      case "approved":
      case "reviewed":
        setSessionState(sessionId, {
          ...session,
          sessionToken: sessionTokenHash,
          url
        });
        ctx.logger.info({ planId, sessionId }, "Updated session token");
        break;
      default:
        assertNever(session);
    }
  }
  ctx.logger.info({ planId }, "Session token set successfully");
  return { url };
}
async function waitForApprovalHandler(planId, _reviewRequestIdParam, ctx) {
  let ydoc;
  try {
    ydoc = await ctx.getOrCreateDoc(planId);
  } catch (err) {
    ctx.logger.error({ err, planId }, "Failed to get or create doc for approval waiting");
    throw err;
  }
  const metadata = ydoc.getMap(YDOC_KEYS.METADATA);
  const reviewRequestId = nanoid2();
  const planMetadata = getPlanMetadata(ydoc);
  const ownerId = planMetadata?.ownerId ?? "unknown";
  if (planMetadata?.status === "pending_review") {
    ctx.logger.warn(
      { planId, currentStatus: planMetadata.status },
      "Status already pending_review, another hook may be waiting. Skipping reviewRequestId update."
    );
  } else {
    const result = transitionPlanStatus(
      ydoc,
      {
        status: "pending_review",
        reviewRequestId
      },
      ownerId
    );
    if (!result.success) {
      ctx.logger.error({ planId, error: result.error }, "Failed to transition to pending_review");
    }
  }
  ctx.logger.info(
    { planId, reviewRequestId },
    "[SERVER OBSERVER] Set reviewRequestId and status, starting observation"
  );
  const getReviewData = () => ({
    reviewComment: metadata.get("reviewComment"),
    reviewedBy: metadata.get("reviewedBy")
  });
  const updateSessionRegistry = (status, extraData = {}) => {
    const sessionData = getSessionData();
    if (!sessionData) return;
    const { session, sessionId } = sessionData;
    validateSessionStateForTransition(session);
    const baseState = buildBaseState(session);
    const syncedFields = buildSyncedFields(session);
    const { reviewComment, reviewedBy } = getReviewData();
    if (status === "in_progress") {
      handleApprovedTransition(
        sessionId,
        baseState,
        syncedFields,
        extraData,
        reviewComment,
        reviewedBy
      );
    } else if (status === "changes_requested") {
      handleReviewedTransition(
        sessionId,
        baseState,
        syncedFields,
        session,
        extraData,
        reviewComment,
        reviewedBy
      );
    } else {
      throw new Error(
        `Invalid session state transition: missing required fields. status=${status}, hasApprovedAt=${!!extraData.approvedAt}, hasDeliverables=${!!extraData.deliverables}, hasReviewedBy=${!!reviewedBy}`
      );
    }
    logRegistryUpdate(status, extraData);
  };
  const getSessionData = () => {
    const session = getSessionStateByPlanId(planId);
    const sessionId = getSessionIdByPlanId(planId);
    if (!session || !sessionId) {
      ctx.logger.warn(
        { planId },
        "Session not found in registry during approval - post-exit injection will not work"
      );
      return null;
    }
    return { session, sessionId };
  };
  const validateSessionStateForTransition = (_session) => {
  };
  const buildBaseState = (session) => ({
    planId: session.planId,
    planFilePath: session.planFilePath,
    createdAt: session.createdAt,
    lastSyncedAt: session.lastSyncedAt
  });
  const buildSyncedFields = (session) => {
    if (isSessionStateSynced(session) || isSessionStateApproved(session) || isSessionStateReviewed(session)) {
      return {
        contentHash: session.contentHash,
        sessionToken: session.sessionToken,
        url: session.url
      };
    }
    return null;
  };
  const handleApprovedTransition = (sessionId, baseState, syncedFields, extraData, reviewComment, reviewedBy) => {
    if (!extraData.approvedAt || !extraData.deliverables) {
      throw new Error(
        `Invalid session state transition: missing required fields for approval. hasApprovedAt=${!!extraData.approvedAt}, hasDeliverables=${!!extraData.deliverables}`
      );
    }
    const webUrl = webConfig.SHIPYARD_WEB_URL;
    if (syncedFields) {
      setSessionState(sessionId, {
        lifecycle: "approved",
        ...baseState,
        ...syncedFields,
        approvedAt: extraData.approvedAt,
        deliverables: extraData.deliverables,
        reviewComment,
        reviewedBy
      });
    } else {
      setSessionState(sessionId, {
        lifecycle: "approved_awaiting_token",
        ...baseState,
        url: `${webUrl}/plan/${baseState.planId}`,
        approvedAt: extraData.approvedAt,
        deliverables: extraData.deliverables,
        reviewComment,
        reviewedBy
      });
    }
  };
  const handleReviewedTransition = (sessionId, baseState, syncedFields, session, extraData, reviewComment, reviewedBy) => {
    if (!reviewedBy) {
      throw new Error(`Invalid session state transition: missing reviewedBy for changes_requested`);
    }
    if (!syncedFields) {
      throw new Error(
        `Invalid session state transition: changes_requested requires synced fields (contentHash, sessionToken)`
      );
    }
    const deliverables = extraData.deliverables || (isSessionStateApproved(session) || isSessionStateReviewed(session) || isSessionStateApprovedAwaitingToken(session) ? session.deliverables : []);
    setSessionState(sessionId, {
      lifecycle: "reviewed",
      ...baseState,
      ...syncedFields,
      deliverables,
      reviewComment: reviewComment || "",
      reviewedBy,
      reviewStatus: "changes_requested"
    });
  };
  const logRegistryUpdate = (status, extraData) => {
    const sessionId = getSessionIdByPlanId(planId);
    ctx.logger.info(
      {
        planId,
        sessionId,
        ...extraData.deliverables && { deliverableCount: extraData.deliverables.length }
      },
      `Stored ${status === "in_progress" ? "approval" : "rejection"} data in session registry`
    );
  };
  const handleApproved = () => {
    const deliverables = getDeliverables(ydoc);
    const deliverableInfos = deliverables.map((d) => ({ id: d.id, text: d.text }));
    updateSessionRegistry("in_progress", {
      approvedAt: Date.now(),
      deliverables: deliverableInfos
    });
    const { reviewComment, reviewedBy } = getReviewData();
    ctx.logger.info(
      { planId, reviewRequestId, reviewedBy },
      "[SERVER OBSERVER] Plan approved via Y.Doc - resolving promise"
    );
    return {
      approved: true,
      deliverables,
      reviewComment,
      reviewedBy: reviewedBy || "unknown",
      // Required by schema
      status: "in_progress"
    };
  };
  const handleChangesRequested = () => {
    updateSessionRegistry("changes_requested");
    const feedback = extractFeedbackFromYDoc(ydoc, ctx);
    const { reviewComment, reviewedBy } = getReviewData();
    ctx.logger.info(
      { planId, reviewRequestId, feedback },
      "[SERVER OBSERVER] Changes requested via Y.Doc"
    );
    return {
      approved: false,
      feedback: feedback || "Changes requested",
      // Required by schema
      status: "changes_requested",
      reviewComment,
      reviewedBy
    };
  };
  return new Promise((resolve3, reject) => {
    const APPROVAL_TIMEOUT_MS = 30 * 60 * 1e3;
    let timeout = null;
    let checkStatus = null;
    const shouldProcessStatusChange = (currentReviewId, status) => {
      if (currentReviewId !== reviewRequestId) {
        ctx.logger.warn(
          { planId, expected: reviewRequestId, actual: currentReviewId, status },
          "[SERVER OBSERVER] Review ID mismatch, ignoring status change"
        );
        return false;
      }
      const isTerminalState = status === "in_progress" || status === "changes_requested";
      return isTerminalState;
    };
    const cleanupObserver = () => {
      if (timeout) clearTimeout(timeout);
      if (checkStatus) metadata.unobserve(checkStatus);
    };
    try {
      timeout = setTimeout(() => {
        if (checkStatus) {
          metadata.unobserve(checkStatus);
        }
        resolve3({
          approved: false,
          feedback: "Review timeout - no decision received in 30 minutes",
          status: "timeout"
        });
      }, APPROVAL_TIMEOUT_MS);
      checkStatus = () => {
        const currentReviewId = metadata.get("reviewRequestId");
        const status = metadata.get("status");
        ctx.logger.debug(
          { planId, status, currentReviewId, expectedReviewId: reviewRequestId },
          "[SERVER OBSERVER] Metadata changed, checking status"
        );
        if (!shouldProcessStatusChange(currentReviewId, status)) return;
        cleanupObserver();
        resolve3(status === "in_progress" ? handleApproved() : handleChangesRequested());
      };
      ctx.logger.info(
        { planId, reviewRequestId },
        "[SERVER OBSERVER] Registering metadata observer"
      );
      metadata.observe((event) => {
        ctx.logger.info(
          {
            planId,
            reviewRequestId,
            keysChanged: Array.from(event.keysChanged),
            target: event.target.constructor.name
          },
          "[SERVER OBSERVER] *** METADATA MAP CHANGED *** (Raw Y.Map observer)"
        );
      });
      metadata.observe(checkStatus);
      checkStatus();
    } catch (err) {
      if (timeout) clearTimeout(timeout);
      if (checkStatus) {
        try {
          metadata.unobserve(checkStatus);
        } catch (unobserveErr) {
          ctx.logger.warn({ err: unobserveErr }, "Failed to unobserve during error cleanup");
        }
      }
      ctx.logger.error({ err, planId }, "Failed to setup approval observer");
      reject(err);
    }
  });
}
function extractFeedbackFromYDoc(ydoc, ctx) {
  try {
    const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
    const reviewComment = metadataMap.get("reviewComment");
    const reviewedBy = metadataMap.get("reviewedBy");
    const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
    const threadsData = threadsMap.toJSON();
    const threads = parseThreads(threadsData);
    if (!reviewComment && threads.length === 0) {
      return "Changes requested. Check the plan for reviewer comments.";
    }
    const contentFragment = ydoc.getXmlFragment(YDOC_KEYS.DOCUMENT_FRAGMENT);
    const blocks = contentFragment.toJSON();
    const planText = blocks.map((block) => {
      if (!block.content || !Array.isArray(block.content)) return "";
      return block.content.map((item) => typeof item === "object" && item && "text" in item ? item.text : "").join("");
    }).filter(Boolean).join("\n");
    const resolveUser = createUserResolver(ydoc);
    const feedbackText = formatThreadsForLLM(threads, {
      includeResolved: false,
      selectedTextMaxLength: 100,
      resolveUser
    });
    let output = "Changes requested:\n\n";
    if (planText) {
      output += "## Current Plan\n\n";
      output += planText;
      output += "\n\n---\n\n";
    }
    if (reviewComment) {
      output += "## Reviewer Comment\n\n";
      output += `> **${reviewedBy ?? "Reviewer"}:** ${reviewComment}
`;
      output += "\n---\n\n";
    }
    if (feedbackText) {
      output += "## Inline Feedback\n\n";
      output += feedbackText;
    }
    const deliverables = getDeliverables(ydoc);
    const deliverablesText = formatDeliverablesForLLM(deliverables);
    if (deliverablesText) {
      output += "\n\n---\n\n";
      output += deliverablesText;
    }
    return output;
  } catch (err) {
    ctx.logger.warn({ err }, "Failed to extract feedback from Y.Doc");
    return "Changes requested. Check the plan for reviewer comments.";
  }
}
async function getDeliverableContextHandler(planId, sessionToken, ctx) {
  const ydoc = await ctx.getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Plan not found"
    });
  }
  const deliverables = getDeliverables(ydoc);
  const webUrl = webConfig.SHIPYARD_WEB_URL;
  const url = `${webUrl}/plan/${planId}`;
  let deliverablesSection = "";
  if (deliverables.length > 0) {
    deliverablesSection = `
## Deliverables

Attach proof to each deliverable using add_artifact:

`;
    for (const d of deliverables) {
      deliverablesSection += `- ${d.text}
  deliverableId="${d.id}"
`;
    }
  } else {
    deliverablesSection = `
## Deliverables

No deliverables marked in this plan. You can still upload artifacts without linking them.`;
  }
  let feedbackSection = "";
  if (metadata.status === "changes_requested" && metadata.reviewComment?.trim()) {
    feedbackSection = `
## Reviewer Feedback

${metadata.reviewedBy ? `**From:** ${metadata.reviewedBy}

` : ""}${metadata.reviewComment}

`;
  }
  const approvalMessage = metadata.status === "changes_requested" ? "[SHIPYARD] Changes requested on your plan \u26A0\uFE0F" : "[SHIPYARD] Plan approved! \u{1F389}";
  const context = `${approvalMessage}
${deliverablesSection}${feedbackSection}
## Session Info

planId="${planId}"
sessionToken="${sessionToken}"
url="${url}"

## How to Attach Proof

For each deliverable above, call:
\`\`\`
add_artifact(
  planId="${planId}",
  sessionToken="${sessionToken}",
  type="screenshot",  // or "video", "test_results", "diff"
  filePath="/path/to/file.png",
  deliverableId="<id from above>"
)
\`\`\`

When the LAST deliverable gets an artifact, the task auto-completes and returns a snapshot URL for your PR.`;
  return { context };
}
async function getSessionContextHandler(sessionId, ctx) {
  ctx.logger.info({ sessionId }, "Getting session context for post-exit injection");
  const sessionState = getSessionState(sessionId);
  if (!sessionState) {
    ctx.logger.warn({ sessionId }, "Session not found in registry");
    return { found: false };
  }
  if (isSessionStateApproved(sessionState)) {
    ctx.logger.info(
      { sessionId, planId: sessionState.planId },
      "Session context retrieved (approved state, idempotent)"
    );
    return {
      found: true,
      planId: sessionState.planId,
      sessionToken: sessionState.sessionToken,
      url: sessionState.url,
      deliverables: sessionState.deliverables,
      reviewComment: sessionState.reviewComment,
      reviewedBy: sessionState.reviewedBy
    };
  }
  if (isSessionStateReviewed(sessionState)) {
    ctx.logger.info(
      { sessionId, planId: sessionState.planId },
      "Session context retrieved (reviewed state, idempotent)"
    );
    return {
      found: true,
      planId: sessionState.planId,
      sessionToken: sessionState.sessionToken,
      url: sessionState.url,
      deliverables: sessionState.deliverables,
      reviewComment: sessionState.reviewComment,
      reviewedBy: sessionState.reviewedBy,
      reviewStatus: sessionState.reviewStatus
    };
  }
  ctx.logger.warn(
    { sessionId, lifecycle: sessionState.lifecycle },
    "Session not ready for post-exit injection"
  );
  return { found: false };
}
function createHookHandlers() {
  return {
    createSession: (input, ctx) => createSessionHandler(input, ctx),
    updateContent: (planId, input, ctx) => updateContentHandler(planId, input, ctx),
    getReviewStatus: (planId, ctx) => getReviewStatusHandler(planId, ctx),
    updatePresence: (planId, input, ctx) => updatePresenceHandler(planId, input, ctx),
    setSessionToken: (planId, sessionTokenHash, ctx) => setSessionTokenHandler(planId, sessionTokenHash, ctx),
    waitForApproval: (planId, reviewRequestId, ctx) => waitForApprovalHandler(planId, reviewRequestId, ctx),
    getDeliverableContext: (planId, sessionToken, ctx) => getDeliverableContextHandler(planId, sessionToken, ctx),
    getSessionContext: (sessionId, ctx) => getSessionContextHandler(sessionId, ctx)
  };
}

// src/subscriptions/manager.ts
import { nanoid as nanoid3 } from "nanoid";
var subscriptions = /* @__PURE__ */ new Map();
var SUBSCRIPTION_TTL_MS = 5 * 60 * 1e3;
function createSubscription(config) {
  const id = nanoid3();
  const now = Date.now();
  const subscription = {
    id,
    config,
    pendingChanges: [],
    windowStartedAt: null,
    lastFlushedAt: now,
    lastActivityAt: now,
    ready: false
  };
  let planSubs = subscriptions.get(config.planId);
  if (!planSubs) {
    planSubs = /* @__PURE__ */ new Map();
    subscriptions.set(config.planId, planSubs);
  }
  planSubs.set(id, subscription);
  logger.info(
    { planId: config.planId, subscriptionId: id, subscribe: config.subscribe },
    "Subscription created"
  );
  return id;
}
function deleteSubscription(planId, subscriptionId) {
  const deleted = subscriptions.get(planId)?.delete(subscriptionId) ?? false;
  if (deleted) {
    logger.info({ planId, subscriptionId }, "Subscription deleted");
    if (subscriptions.get(planId)?.size === 0) {
      subscriptions.delete(planId);
    }
  }
  return deleted;
}
function notifyChange(planId, change) {
  const planSubs = subscriptions.get(planId);
  if (!planSubs) return;
  const now = Date.now();
  for (const sub of planSubs.values()) {
    if (!sub.config.subscribe.includes(change.type)) continue;
    sub.pendingChanges.push(change);
    sub.lastActivityAt = now;
    if (sub.windowStartedAt === null) {
      sub.windowStartedAt = now;
    }
    checkFlushConditions(sub);
  }
  logger.debug(
    { planId, changeType: change.type, subscriberCount: planSubs.size },
    "Change notified"
  );
}
function getChanges(planId, subscriptionId) {
  const sub = subscriptions.get(planId)?.get(subscriptionId);
  if (!sub) return null;
  const now = Date.now();
  sub.lastActivityAt = now;
  checkFlushConditions(sub);
  if (!sub.ready) {
    return {
      ready: false,
      pending: sub.pendingChanges.length,
      windowExpiresIn: sub.windowStartedAt ? Math.max(0, sub.config.windowMs - (now - sub.windowStartedAt)) : sub.config.windowMs
    };
  }
  const changes = sub.pendingChanges;
  const summary = summarizeChanges(changes);
  sub.pendingChanges = [];
  sub.windowStartedAt = null;
  sub.lastFlushedAt = now;
  sub.ready = false;
  logger.debug({ planId, subscriptionId, changeCount: changes.length }, "Changes flushed");
  return {
    ready: true,
    changes: summary,
    details: changes
  };
}
function startCleanupInterval() {
  startPeriodicCleanup();
  setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [planId, planSubs] of subscriptions.entries()) {
      for (const [subId, sub] of planSubs.entries()) {
        if (now - sub.lastActivityAt > SUBSCRIPTION_TTL_MS) {
          planSubs.delete(subId);
          cleanedCount++;
        }
      }
      if (planSubs.size === 0) {
        subscriptions.delete(planId);
      }
    }
    if (cleanedCount > 0) {
      logger.info({ cleanedCount }, "Cleaned up stale subscriptions");
    }
  }, 6e4);
}
function checkFlushConditions(sub) {
  const now = Date.now();
  const { windowMs, maxWindowMs, threshold } = sub.config;
  if (sub.pendingChanges.length >= threshold) {
    sub.ready = true;
    return;
  }
  if (sub.windowStartedAt && now - sub.windowStartedAt >= windowMs) {
    sub.ready = true;
    return;
  }
  if (now - sub.lastFlushedAt >= maxWindowMs && sub.pendingChanges.length > 0) {
    sub.ready = true;
  }
}
function summarizeChanges(changes) {
  const parts = [];
  const statusChanges = changes.filter((c) => c.type === "status");
  if (statusChanges.length > 0) {
    const latest = statusChanges[statusChanges.length - 1];
    if (latest) {
      parts.push(`Status: ${latest.details?.newValue}`);
    }
  }
  const commentChanges = changes.filter((c) => c.type === "comments");
  if (commentChanges.length > 0) {
    const totalAdded = commentChanges.reduce(
      (acc, c) => acc + (c.details?.added || 1),
      0
    );
    parts.push(`${totalAdded} new comment(s)`);
  }
  const resolvedChanges = changes.filter((c) => c.type === "resolved");
  if (resolvedChanges.length > 0) {
    const totalResolved = resolvedChanges.reduce(
      (acc, c) => acc + (c.details?.resolved || 1),
      0
    );
    parts.push(`${totalResolved} resolved`);
  }
  const contentChanges = changes.filter((c) => c.type === "content");
  if (contentChanges.length > 0) {
    parts.push("Content updated");
  }
  const artifactChanges = changes.filter((c) => c.type === "artifacts");
  if (artifactChanges.length > 0) {
    const totalAdded = artifactChanges.reduce(
      (acc, c) => acc + (c.details?.added || 1),
      0
    );
    parts.push(`${totalAdded} artifact(s) added`);
  }
  return parts.join(" | ") || "No changes";
}

// src/subscriptions/observers.ts
var previousState = /* @__PURE__ */ new Map();
var lastContentEdit = /* @__PURE__ */ new Map();
var CONTENT_EDIT_DEBOUNCE_MS = 5e3;
function attachObservers(planId, doc) {
  const metadata = getPlanMetadata(doc);
  const threadsMap = doc.getMap(YDOC_KEYS.THREADS);
  const threads = parseThreads(threadsMap.toJSON());
  const deliverables = getDeliverables(doc);
  const allFulfilled = deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);
  const initialCommentIds = /* @__PURE__ */ new Set();
  for (const thread of threads) {
    for (const comment of thread.comments) {
      initialCommentIds.add(comment.id);
    }
  }
  previousState.set(planId, {
    status: metadata?.status,
    commentCount: threads.reduce((acc, t) => acc + t.comments.length, 0),
    resolvedCount: threads.filter((t) => t.resolved).length,
    contentLength: doc.getXmlFragment("document").length,
    artifactCount: doc.getArray(YDOC_KEYS.ARTIFACTS).length,
    deliverablesFulfilled: allFulfilled,
    commentIds: initialCommentIds
  });
  logger.debug({ planId }, "Attached observers to plan");
  doc.getMap(YDOC_KEYS.METADATA).observe((event, transaction) => {
    if (event.keysChanged.has("status")) {
      const prev = previousState.get(planId);
      const rawStatus = doc.getMap(YDOC_KEYS.METADATA).get("status");
      const newStatus = typeof rawStatus === "string" && PlanStatusValues.includes(rawStatus) ? rawStatus : void 0;
      if (prev?.status && prev.status !== newStatus && newStatus) {
        const actor = transaction.origin?.actor || "System";
        logPlanEvent(doc, "status_changed", actor, {
          fromStatus: prev.status,
          toStatus: newStatus
        });
        const change = {
          type: "status",
          timestamp: Date.now(),
          summary: `Status changed to ${newStatus}`,
          details: { oldValue: prev.status, newValue: newStatus }
        };
        notifyChange(planId, change);
        prev.status = newStatus;
        logger.debug({ planId, oldStatus: prev.status, newStatus }, "Status change detected");
      }
    }
  });
  doc.getMap(YDOC_KEYS.THREADS).observeDeep((_events, transaction) => {
    const prev = previousState.get(planId);
    if (!prev) return;
    const actor = transaction.origin?.actor || "System";
    const threadsMap2 = doc.getMap(YDOC_KEYS.THREADS);
    const threads2 = parseThreads(threadsMap2.toJSON());
    handleNewComments(doc, planId, threads2, prev, actor);
    handleResolvedComments(doc, planId, threads2, prev, actor);
  });
  doc.getXmlFragment("document").observeDeep((_events, transaction) => {
    const now = Date.now();
    const lastEdit = lastContentEdit.get(planId) || 0;
    if (now - lastEdit > CONTENT_EDIT_DEBOUNCE_MS) {
      const actor = transaction.origin?.actor || "System";
      logPlanEvent(doc, "content_edited", actor);
      lastContentEdit.set(planId, now);
    }
    notifyChange(planId, {
      type: "content",
      timestamp: Date.now(),
      summary: "Content updated"
    });
    logger.debug({ planId }, "Content change detected");
  });
  doc.getArray(YDOC_KEYS.ARTIFACTS).observe((_event, transaction) => {
    const prev = previousState.get(planId);
    if (!prev) return;
    const actor = transaction.origin?.actor || "System";
    const newCount = doc.getArray(YDOC_KEYS.ARTIFACTS).length;
    if (newCount > prev.artifactCount) {
      const diff = newCount - prev.artifactCount;
      const artifacts = doc.getArray(YDOC_KEYS.ARTIFACTS).toArray();
      const newArtifact = artifacts[artifacts.length - 1];
      logPlanEvent(doc, "artifact_uploaded", actor, {
        artifactId: newArtifact.id
      });
      notifyChange(planId, {
        type: "artifacts",
        timestamp: Date.now(),
        summary: `${diff} artifact(s) added`,
        details: { added: diff }
      });
      prev.artifactCount = newCount;
      logger.debug({ planId, added: diff }, "Artifacts added detected");
    }
  });
  doc.getArray(YDOC_KEYS.DELIVERABLES).observeDeep((_events, transaction) => {
    const prev = previousState.get(planId);
    if (!prev) return;
    const deliverables2 = getDeliverables(doc);
    const allFulfilled2 = deliverables2.length > 0 && deliverables2.every((d) => d.linkedArtifactId);
    if (allFulfilled2 && !prev.deliverablesFulfilled) {
      const actor = transaction.origin?.actor || "System";
      logPlanEvent(
        doc,
        "deliverable_linked",
        actor,
        {
          allFulfilled: true
        },
        {
          inboxWorthy: true,
          inboxFor: "owner"
        }
      );
      prev.deliverablesFulfilled = true;
      logger.debug({ planId }, "All deliverables fulfilled - inbox-worthy event logged");
    }
  });
}
function detectNewComments(threads, prevCommentIds) {
  const newComments = [];
  for (const thread of threads) {
    for (const comment of thread.comments) {
      if (!prevCommentIds.has(comment.id)) {
        newComments.push(comment);
      }
    }
  }
  return newComments;
}
function logCommentWithMentions(doc, planId, comment, actor) {
  const mentions = extractMentions(comment.body);
  const hasMentions = mentions.length > 0;
  logPlanEvent(
    doc,
    "comment_added",
    actor,
    { commentId: comment.id, mentions: hasMentions },
    {
      inboxWorthy: hasMentions,
      inboxFor: hasMentions ? mentions : void 0
    }
  );
  if (hasMentions) {
    logger.debug(
      { planId, commentId: comment.id, mentions },
      "Comment with @mentions logged as inbox-worthy"
    );
  }
}
function handleNewComments(doc, planId, threads, prev, actor) {
  const newCommentCount = threads.reduce((acc, t) => acc + t.comments.length, 0);
  if (newCommentCount <= prev.commentCount) return;
  const diff = newCommentCount - prev.commentCount;
  const newComments = detectNewComments(threads, prev.commentIds);
  for (const comment of newComments) {
    prev.commentIds.add(comment.id);
    logCommentWithMentions(doc, planId, comment, actor);
  }
  notifyChange(planId, {
    type: "comments",
    timestamp: Date.now(),
    summary: `${diff} new comment(s)`,
    details: { added: diff }
  });
  prev.commentCount = newCommentCount;
  logger.debug({ planId, added: diff }, "New comments detected");
}
function handleResolvedComments(doc, planId, threads, prev, actor) {
  const newResolvedCount = threads.filter((t) => t.resolved).length;
  if (newResolvedCount <= prev.resolvedCount) return;
  const diff = newResolvedCount - prev.resolvedCount;
  logPlanEvent(doc, "comment_resolved", actor, { resolvedCount: diff });
  notifyChange(planId, {
    type: "resolved",
    timestamp: Date.now(),
    summary: `${diff} comment(s) resolved`,
    details: { resolved: diff }
  });
  prev.resolvedCount = newResolvedCount;
  logger.debug({ planId, resolved: diff }, "Comments resolved detected");
}

// src/registry-server.ts
var PERSISTENCE_DIR = join3(homedir3(), ".shipyard", "plans");
var HUB_LOCK_FILE = join3(homedir3(), ".shipyard", "hub.lock");
var SHIPYARD_DIR = join3(homedir3(), ".shipyard");
var MAX_LOCK_RETRIES = 3;
var messageSync = 0;
var messageAwareness = 1;
var docs2 = /* @__PURE__ */ new Map();
var awarenessMap = /* @__PURE__ */ new Map();
var conns = /* @__PURE__ */ new Map();
var ldb = null;
async function readLockHolderPid() {
  try {
    const content = await readFile(HUB_LOCK_FILE, "utf-8");
    const pidStr = content.split("\n")[0] ?? "";
    return Number.parseInt(pidStr, 10);
  } catch (readErr) {
    logger.error({ err: readErr }, "Failed to read hub lock file");
    return null;
  }
}
function isLockHolderAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function tryRemoveStaleLock(stalePid, retryCount) {
  logger.warn({ stalePid, retryCount }, "Removing stale hub lock");
  try {
    await unlink(HUB_LOCK_FILE);
    return true;
  } catch (unlinkErr) {
    logger.error({ err: unlinkErr, stalePid, retryCount }, "Failed to remove stale hub lock");
    return false;
  }
}
function registerLockCleanupHandler() {
  process.once("exit", () => {
    try {
      unlinkSync(HUB_LOCK_FILE);
    } catch {
    }
  });
}
async function handleExistingLock(retryCount) {
  const pid = await readLockHolderPid();
  if (pid === null) return false;
  if (isLockHolderAlive(pid)) {
    logger.debug({ holderPid: pid }, "Hub lock held by active process");
    return false;
  }
  if (retryCount >= MAX_LOCK_RETRIES) {
    logger.error(
      { stalePid: pid, retryCount },
      "Max retries exceeded while removing stale hub lock"
    );
    return false;
  }
  await tryRemoveStaleLock(pid, retryCount);
  return tryAcquireHubLock(retryCount + 1);
}
async function tryAcquireHubLock(retryCount = 0) {
  try {
    mkdirSync(SHIPYARD_DIR, { recursive: true });
    await writeFile2(HUB_LOCK_FILE, `${process.pid}
${Date.now()}`, { flag: "wx" });
    registerLockCleanupHandler();
    logger.info({ pid: process.pid }, "Acquired hub lock");
    return true;
  } catch (err) {
    const isLockExists = err.code === "EEXIST";
    if (isLockExists) {
      return handleExistingLock(retryCount);
    }
    logger.error({ err }, "Failed to acquire hub lock");
    return false;
  }
}
async function releaseHubLock() {
  try {
    await unlink(HUB_LOCK_FILE);
    logger.info("Released hub lock");
  } catch (err) {
    logger.debug({ err }, "Hub lock already released");
  }
}
function isLevelDbLockError(error) {
  return error.message?.includes("LOCK") || error.message?.includes("lock");
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function tryRecoverStaleLock(originalError) {
  const lockFile = join3(PERSISTENCE_DIR, "LOCK");
  try {
    const hubLockContent = readFileSync(HUB_LOCK_FILE, "utf-8");
    const pidStr = hubLockContent.split("\n")[0] ?? "";
    const pid = Number.parseInt(pidStr, 10);
    if (isProcessAlive(pid)) {
      logger.error({ holderPid: pid }, "LevelDB locked by active process, cannot recover");
      throw originalError;
    }
    logger.warn("Hub process dead, removing stale LevelDB lock");
    unlinkSync(lockFile);
    return true;
  } catch (hubLockErr) {
    if (hubLockErr === originalError) {
      throw hubLockErr;
    }
    logger.warn("No hub.lock found, assuming LevelDB lock is stale");
    unlinkSync(lockFile);
    return true;
  }
}
function initPersistence() {
  if (ldb) return;
  mkdirSync(PERSISTENCE_DIR, { recursive: true });
  try {
    ldb = new LeveldbPersistence(PERSISTENCE_DIR);
    logger.info({ dir: PERSISTENCE_DIR }, "LevelDB persistence initialized");
    return;
  } catch (err) {
    const error = err;
    if (!isLevelDbLockError(error)) {
      logger.error({ err: error }, "Failed to initialize LevelDB persistence");
      throw error;
    }
    logger.warn({ err: error }, "LevelDB locked, checking for stale lock");
    tryRecoverStaleLock(error);
    ldb = new LeveldbPersistence(PERSISTENCE_DIR);
    logger.info("Recovered from stale LevelDB lock");
  }
}
async function getDoc(docName) {
  initPersistence();
  const persistence = ldb;
  if (!persistence) {
    throw new Error("LevelDB persistence failed to initialize");
  }
  let doc = docs2.get(docName);
  if (!doc) {
    doc = new Y2.Doc();
    const persistedDoc = await persistence.getYDoc(docName);
    const state = Y2.encodeStateAsUpdate(persistedDoc);
    Y2.applyUpdate(doc, state);
    doc.on("update", (update) => {
      persistence.storeUpdate(docName, update);
    });
    docs2.set(docName, doc);
    const awareness = new awarenessProtocol.Awareness(doc);
    awarenessMap.set(docName, awareness);
    attachObservers(docName, doc);
    attachCRDTValidation(docName, doc);
  }
  return doc;
}
async function getOrCreateDoc2(docName) {
  return getDoc(docName);
}
function hasActiveConnections3(planId) {
  const connections = conns.get(planId);
  return connections !== void 0 && connections.size > 0;
}
function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(message);
  }
}
function broadcastUpdate(docName, update, origin) {
  const docConns = conns.get(docName);
  if (!docConns) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  for (const conn of docConns) {
    if (conn !== origin) {
      send(conn, message);
    }
  }
}
function processMessage(message, doc, awareness, planId, ws) {
  try {
    const decoder = decoding.createDecoder(new Uint8Array(message));
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
        if (encoding.length(encoder) > 1) {
          send(ws, encoding.toUint8Array(encoder));
        }
        break;
      }
      case messageAwareness: {
        awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws);
        break;
      }
    }
  } catch (err) {
    logger.error({ err, planId }, "Failed to process message");
  }
}
function handleWebSocketConnection(ws, req) {
  const planId = req.url?.slice(1) || "default";
  logger.info({ planId }, "WebSocket client connected to registry");
  const pendingMessages = [];
  let docReady = false;
  let doc;
  let awareness;
  ws.on("message", (message) => {
    if (!docReady) {
      pendingMessages.push(message);
      logger.debug(
        { planId, bufferedCount: pendingMessages.length },
        "Buffering message (doc not ready)"
      );
      return;
    }
    processMessage(message, doc, awareness, planId, ws);
  });
  ws.on("error", (err) => {
    logger.error({ err, planId }, "WebSocket error");
  });
  (async () => {
    try {
      doc = await getDoc(planId);
      const awarenessResult = awarenessMap.get(planId);
      if (!awarenessResult) {
        throw new Error(`Awareness not found for planId: ${planId}`);
      }
      awareness = awarenessResult;
      logger.debug({ planId }, "Got doc and awareness");
      if (!conns.has(planId)) {
        conns.set(planId, /* @__PURE__ */ new Set());
      }
      const planConns = conns.get(planId);
      planConns?.add(ws);
      const updateHandler = (update, origin) => {
        broadcastUpdate(planId, update, origin);
      };
      doc.on("update", updateHandler);
      const awarenessHandler = ({ added, updated, removed }, _origin) => {
        const changedClients = added.concat(updated, removed);
        const encoder2 = encoding.createEncoder();
        encoding.writeVarUint(encoder2, messageAwareness);
        encoding.writeVarUint8Array(
          encoder2,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const message = encoding.toUint8Array(encoder2);
        for (const conn of conns.get(planId) || []) {
          send(conn, message);
        }
      };
      awareness.on("update", awarenessHandler);
      docReady = true;
      if (pendingMessages.length > 0) {
        logger.debug({ planId, count: pendingMessages.length }, "Processing buffered messages");
        for (const msg of pendingMessages) {
          processMessage(msg, doc, awareness, planId, ws);
        }
        pendingMessages.length = 0;
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, doc);
      send(ws, encoding.toUint8Array(encoder));
      const awarenessStates = awareness.getStates();
      if (awarenessStates.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, messageAwareness);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys()))
        );
        send(ws, encoding.toUint8Array(awarenessEncoder));
      }
      ws.on("close", () => {
        logger.info({ planId }, "WebSocket client disconnected from registry");
        doc.off("update", updateHandler);
        awareness.off("update", awarenessHandler);
        conns.get(planId)?.delete(ws);
        awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);
      });
    } catch (err) {
      logger.error({ err, planId }, "Error handling WebSocket connection");
      ws.close();
    }
  })();
}
async function handleHealthCheck(_req, res) {
  res.json({ status: "ok" });
}
async function handleGetPRDiff(req, res) {
  const { id: planId, prNumber } = req.params;
  if (!planId || !prNumber) {
    res.status(400).json({ error: "Missing plan ID or PR number" });
    return;
  }
  try {
    const doc = await getOrCreateDoc2(planId);
    const metadata = getPlanMetadata(doc);
    if (!metadata || !metadata.repo) {
      res.status(404).json({ error: "Plan not found or repo not set" });
      return;
    }
    const octokit = getOctokit();
    if (!octokit) {
      res.status(500).json({ error: "GitHub authentication not configured" });
      return;
    }
    const { owner, repoName } = parseRepoString(metadata.repo);
    const prNum = Number.parseInt(prNumber, 10);
    const response = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner,
      repo: repoName,
      pull_number: prNum,
      headers: {
        accept: "application/vnd.github.diff"
      }
    });
    res.type("text/plain").send(response.data);
    logger.debug({ planId, prNumber: prNum, repo: metadata.repo }, "Served PR diff");
  } catch (error) {
    logger.error({ error, planId, prNumber }, "Failed to fetch PR diff");
    const status = error.status || 500;
    res.status(status).json({ error: "Failed to fetch PR diff" });
  }
}
async function handleGetPRFiles(req, res) {
  const { id: planId, prNumber } = req.params;
  if (!planId || !prNumber) {
    res.status(400).json({ error: "Missing plan ID or PR number" });
    return;
  }
  try {
    const doc = await getOrCreateDoc2(planId);
    const metadata = getPlanMetadata(doc);
    if (!metadata || !metadata.repo) {
      res.status(404).json({ error: "Plan not found or repo not set" });
      return;
    }
    const octokit = getOctokit();
    if (!octokit) {
      res.status(500).json({ error: "GitHub authentication not configured" });
      return;
    }
    const { owner, repoName } = parseRepoString(metadata.repo);
    const prNum = Number.parseInt(prNumber, 10);
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo: repoName,
      pull_number: prNum
    });
    const fileList = files.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch
    }));
    res.json({ files: fileList });
    logger.debug({ planId, prNumber: prNum, fileCount: fileList.length }, "Served PR files");
  } catch (error) {
    logger.error({ error, planId, prNumber }, "Failed to fetch PR files");
    const status = error.status || 500;
    res.status(status).json({ error: "Failed to fetch PR files" });
  }
}
async function handleGetTranscript(req, res) {
  const planId = req.params.id;
  if (!planId) {
    res.status(400).json({ error: "Missing plan ID" });
    return;
  }
  try {
    const doc = await getOrCreateDoc2(planId);
    const metadata = getPlanMetadata(doc);
    if (!metadata?.origin) {
      res.status(404).json({ error: "Plan has no origin metadata" });
      return;
    }
    if (metadata.origin.platform !== "claude-code") {
      res.status(400).json({ error: "Transcript only available for Claude Code plans" });
      return;
    }
    const transcriptPath = metadata.origin.transcriptPath;
    if (!transcriptPath) {
      res.status(404).json({ error: "No transcript path in origin metadata" });
      return;
    }
    const content = await readFile(transcriptPath, "utf-8");
    res.type("text/plain").send(content);
    logger.debug({ planId, transcriptPath, size: content.length }, "Served transcript for handoff");
  } catch (error) {
    if (error.code === "ENOENT") {
      res.status(404).json({ error: "Transcript file not found" });
    } else {
      logger.error({ error, planId }, "Failed to read transcript");
      res.status(500).json({ error: "Failed to read transcript" });
    }
  }
}
function createPlanStore() {
  return {
    createSubscription: (params) => createSubscription({
      planId: params.planId,
      subscribe: params.subscribe,
      windowMs: params.windowMs,
      maxWindowMs: params.maxWindowMs,
      threshold: params.threshold
    }),
    getChanges: (planId, clientId) => getChanges(planId, clientId),
    deleteSubscription: (planId, clientId) => deleteSubscription(planId, clientId),
    hasActiveConnections: async (planId) => hasActiveConnections3(planId)
  };
}
function createContext() {
  return {
    getOrCreateDoc: getOrCreateDoc2,
    getPlanStore: createPlanStore,
    logger,
    hookHandlers: createHookHandlers(),
    conversationHandlers: createConversationHandlers()
  };
}
function createApp() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });
  app.options("{*splat}", (_req, res) => {
    res.sendStatus(204);
  });
  app.use(express.json({ limit: "10mb" }));
  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  app.get("/registry", handleHealthCheck);
  app.get("/api/plan/:planId/has-connections", (req, res) => {
    const planId = req.params.planId;
    if (!planId) {
      res.status(400).json({ error: "Missing plan ID" });
      return;
    }
    const hasConnections = hasActiveConnections3(planId);
    res.json({ hasConnections });
  });
  app.get("/api/plan/:id/transcript", handleGetTranscript);
  app.get("/api/plans/:id/pr-diff/:prNumber", handleGetPRDiff);
  app.get("/api/plans/:id/pr-files/:prNumber", handleGetPRFiles);
  app.get("/artifacts/:planId/:filename", async (req, res) => {
    const planId = req.params.planId;
    const filename = req.params.filename;
    if (!planId || !filename) {
      res.status(400).json({ error: "Missing planId or filename" });
      return;
    }
    const ARTIFACTS_DIR2 = join3(homedir3(), ".shipyard", "artifacts");
    const fullPath = resolve(ARTIFACTS_DIR2, planId, filename);
    if (!fullPath.startsWith(ARTIFACTS_DIR2 + sep)) {
      res.status(400).json({ error: "Invalid artifact path" });
      return;
    }
    const buffer = await readFile(fullPath).catch(() => null);
    if (!buffer) {
      res.status(404).json({ error: "Artifact not found" });
      return;
    }
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      mp4: "video/mp4",
      webm: "video/webm",
      json: "application/json",
      txt: "text/plain"
    };
    const contentType = mimeTypes[ext || ""] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.send(buffer);
  });
  return { app, httpServer };
}
async function startRegistryServer() {
  const ports = registryConfig.REGISTRY_PORT;
  const { httpServer } = createApp();
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
  wss.on("connection", handleWebSocketConnection);
  process.once("SIGINT", async () => {
    logger.info("SIGINT received, shutting down gracefully");
    const { stopPeriodicCleanup } = await import("./session-registry-DMV543RG.js");
    stopPeriodicCleanup();
    await releaseHubLock();
    process.exit(0);
  });
  process.once("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully");
    const { stopPeriodicCleanup } = await import("./session-registry-DMV543RG.js");
    stopPeriodicCleanup();
    await releaseHubLock();
    process.exit(0);
  });
  for (const port of ports) {
    try {
      await new Promise((resolve3, reject) => {
        httpServer.listen(port, "127.0.0.1", () => {
          logger.info(
            { port, persistence: PERSISTENCE_DIR },
            "Registry server started with WebSocket and tRPC support"
          );
          startCleanupInterval();
          resolve3();
        });
        httpServer.on("error", (err) => {
          if (err.code === "EADDRINUSE") {
            reject(err);
          } else {
            logger.error({ err, port }, "Registry server error");
          }
        });
      });
      return port;
    } catch (err) {
      logger.debug({ err, port }, "Port unavailable or server failed to start");
    }
  }
  logger.warn({ ports }, "All registry ports in use");
  return null;
}
async function isRegistryRunning() {
  const ports = registryConfig.REGISTRY_PORT;
  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/registry`, {
        signal: AbortSignal.timeout(1e3)
      });
      if (res.ok) {
        return port;
      }
    } catch {
    }
  }
  return null;
}

// src/webrtc-provider.ts
import wrtc from "@roamhq/wrtc";
import { WebrtcProvider } from "y-webrtc";
var SIGNALING_SERVER = process.env.SIGNALING_URL || "wss://shipyard-signaling.jacob-191.workers.dev";
if (typeof globalThis.RTCPeerConnection === "undefined") {
  globalThis.RTCPeerConnection = wrtc.RTCPeerConnection;
  globalThis.RTCSessionDescription = wrtc.RTCSessionDescription;
  globalThis.RTCIceCandidate = wrtc.RTCIceCandidate;
}
async function createWebRtcProvider(ydoc, planId) {
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
    logger.info({ turnUrl: process.env.TURN_URL }, "TURN server configured");
  }
  const roomName = `shipyard-${planId}`;
  const provider = new WebrtcProvider(roomName, ydoc, {
    signaling: [SIGNALING_SERVER],
    peerOpts: {
      // @ts-expect-error - wrtc type definitions don't match runtime structure
      wrtc: wrtc.default || wrtc,
      // Pass wrtc polyfill to simple-peer
      config: {
        iceServers
      }
    }
  });
  let username;
  try {
    username = await getGitHubUsername();
    const awarenessState = {
      user: {
        id: `mcp-${username}`,
        name: `Claude Code (${username})`,
        color: "#0066cc"
      },
      platform: "claude-code",
      status: "approved",
      isOwner: true,
      webrtcPeerId: crypto.randomUUID()
    };
    provider.awareness.setLocalStateField("planStatus", awarenessState);
    logger.info({ username, platform: "claude-code" }, "MCP awareness state set");
    sendApprovalStateToSignaling(provider, planId, username);
  } catch (error) {
    logger.warn(
      { error },
      "Could not set MCP awareness (GitHub not authenticated - run: gh auth login)"
    );
  }
  setupProviderListeners(provider, planId);
  logger.info(
    {
      planId,
      roomName,
      signaling: SIGNALING_SERVER,
      hasTurn: iceServers.length > 2
    },
    "WebRTC provider created"
  );
  return provider;
}
function sendApprovalStateToSignaling(provider, planId, username) {
  const signalingConns = provider.signalingConns;
  if (!signalingConns || signalingConns.length === 0) {
    setTimeout(() => sendApprovalStateToSignaling(provider, planId, username), 1e3);
    return;
  }
  const identifyMessage = JSON.stringify({
    type: "subscribe",
    topics: [],
    // Empty topics - just identifying the user
    userId: username
  });
  const approvalStateMessage = JSON.stringify({
    type: "approval_state",
    planId,
    ownerId: username,
    approvedUsers: [username],
    // Owner is always approved
    rejectedUsers: []
  });
  for (const conn of signalingConns) {
    const ws = conn.ws;
    if (ws?.readyState === 1) {
      ws.send?.(identifyMessage);
      ws.send?.(approvalStateMessage);
      logger.info({ planId, username }, "Pushed identity and approval state to signaling server");
    }
  }
}
function setupProviderListeners(provider, planId) {
  provider.on("peers", (event) => {
    const peerCount = event.webrtcPeers.length;
    if (event.added.length > 0) {
      logger.info(
        {
          planId,
          added: event.added,
          totalPeers: peerCount
        },
        "WebRTC peer connected"
      );
    }
    if (event.removed.length > 0) {
      logger.info(
        {
          planId,
          removed: event.removed,
          totalPeers: peerCount
        },
        "WebRTC peer disconnected"
      );
    }
  });
  provider.on("synced", (event) => {
    logger.info(
      {
        planId,
        synced: event.synced
      },
      "WebRTC sync status changed"
    );
  });
  provider.on("status", (event) => {
    logger.info(
      {
        planId,
        connected: event.connected
      },
      "WebRTC signaling status changed"
    );
  });
}

// src/doc-store.ts
var currentMode = "uninitialized";
var webrtcProviders = /* @__PURE__ */ new Map();
function initAsHub() {
  if (currentMode !== "uninitialized") {
    logger.warn({ currentMode }, "Doc store already initialized");
    return;
  }
  currentMode = "hub";
  logger.info("Doc store initialized as hub (registry server mode)");
}
async function initAsClient(registryPort2) {
  if (currentMode !== "uninitialized") {
    logger.warn({ currentMode }, "Doc store already initialized");
    return;
  }
  await initHubClient(registryPort2);
  currentMode = "client";
  logger.info({ registryPort: registryPort2 }, "Doc store initialized as client (hub-client mode)");
}
async function getOrCreateDoc3(docName) {
  let doc;
  switch (currentMode) {
    case "hub":
      doc = await getOrCreateDoc2(docName);
      break;
    case "client":
      doc = await getOrCreateDoc(docName);
      break;
    case "uninitialized":
      if (isHubClientInitialized()) {
        currentMode = "client";
        doc = await getOrCreateDoc(docName);
      } else {
        logger.warn("Doc store not initialized, defaulting to registry server mode");
        currentMode = "hub";
        doc = await getOrCreateDoc2(docName);
      }
  }
  if (!webrtcProviders.has(docName)) {
    try {
      const provider = await createWebRtcProvider(doc, docName);
      webrtcProviders.set(docName, provider);
      logger.info({ docName }, "WebRTC P2P sync enabled for plan");
    } catch (error) {
      logger.error({ error, docName }, "Failed to create WebRTC provider - P2P sync unavailable");
    }
  }
  return doc;
}
async function hasActiveConnections2(planId) {
  switch (currentMode) {
    case "hub":
      return hasActiveConnections3(planId);
    case "client":
      return await hasActiveConnections(planId);
    case "uninitialized":
      return false;
  }
}

// src/tools/execute-code.ts
import * as vm from "vm";
import { z as z12 } from "zod";

// src/tools/add-artifact.ts
import { execSync } from "child_process";
import { readFile as readFile3 } from "fs/promises";
import { ServerBlockNoteEditor as ServerBlockNoteEditor2 } from "@blocknote/server-util";
import { nanoid as nanoid4 } from "nanoid";
import { z as z3 } from "zod";

// src/local-artifacts.ts
import { mkdir as mkdir2, readFile as readFile2, rm, writeFile as writeFile3 } from "fs/promises";
import { homedir as homedir4 } from "os";
import { join as join4, resolve as resolve2, sep as sep2 } from "path";
async function storeLocalArtifact(planId, filename, buffer) {
  const planDir = join4(ARTIFACTS_DIR, planId);
  await mkdir2(planDir, { recursive: true });
  const filepath = join4(planDir, filename);
  await writeFile3(filepath, buffer);
  logger.info({ planId, filename, size: buffer.length }, "Artifact stored locally");
  return `${planId}/${filename}`;
}
async function deleteLocalArtifact(artifactId) {
  try {
    const filepath = resolve2(ARTIFACTS_DIR, artifactId);
    if (!filepath.startsWith(ARTIFACTS_DIR + sep2)) {
      logger.warn({ artifactId, filepath }, "Path traversal attempt in delete");
      return false;
    }
    await rm(filepath, { force: true });
    logger.info({ artifactId }, "Deleted orphaned local artifact");
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    logger.warn({ error, artifactId }, "Failed to delete local artifact");
    return false;
  }
}
var ARTIFACTS_DIR = join4(homedir4(), ".shipyard", "artifacts");

// src/session-token.ts
import { timingSafeEqual } from "crypto";
function verifySessionToken(token, storedHash) {
  const tokenHash = hashSessionToken(token);
  try {
    const tokenHashBuffer = Buffer.from(tokenHash, "hex");
    const storedHashBuffer = Buffer.from(storedHash, "hex");
    if (tokenHashBuffer.length !== storedHashBuffer.length) {
      return false;
    }
    return timingSafeEqual(tokenHashBuffer, storedHashBuffer);
  } catch {
    return false;
  }
}

// src/tools/tool-names.ts
var TOOL_NAMES = {
  ADD_ARTIFACT: "add_artifact",
  ADD_PR_REVIEW_COMMENT: "add_pr_review_comment",
  COMPLETE_TASK: "complete_task",
  CREATE_PLAN: "create_plan",
  EXECUTE_CODE: "execute_code",
  LINK_PR: "link_pr",
  READ_PLAN: "read_plan",
  REQUEST_USER_INPUT: "request_user_input",
  SETUP_REVIEW_NOTIFICATION: "setup_review_notification",
  UPDATE_BLOCK_CONTENT: "update_block_content",
  UPDATE_PLAN: "update_plan"
};

// src/tools/add-artifact.ts
var AddArtifactInputBase = z3.object({
  planId: z3.string().describe("The plan ID to add artifact to"),
  sessionToken: z3.string().describe("Session token from create_plan"),
  type: z3.enum(["screenshot", "video", "test_results", "diff"]).describe("Artifact type"),
  filename: z3.string().describe("Filename for the artifact"),
  description: z3.string().optional().describe("What this artifact proves (deliverable name)"),
  deliverableId: z3.string().optional().describe("ID of the deliverable this artifact fulfills")
});
var AddArtifactInput = z3.discriminatedUnion("source", [
  AddArtifactInputBase.extend({
    source: z3.literal("file"),
    filePath: z3.string().describe("Local file path to upload")
  }),
  AddArtifactInputBase.extend({
    source: z3.literal("url"),
    contentUrl: z3.string().describe("URL to fetch content from")
  }),
  AddArtifactInputBase.extend({
    source: z3.literal("base64"),
    content: z3.string().describe("Base64 encoded file content")
  })
]);
var addArtifactTool = {
  definition: {
    name: TOOL_NAMES.ADD_ARTIFACT,
    description: `Upload an artifact (screenshot, video, test results, diff) to a task as proof of work.

AUTO-COMPLETE: When ALL deliverables have artifacts attached, the task automatically completes:
- Status changes to 'completed'
- PR auto-links from current git branch
- Snapshot URL returned for embedding in PR

This means you usually don't need to call complete_task - just upload artifacts for all deliverables.

STORAGE STRATEGY:
- Tries GitHub upload first (if configured and repo is set)
- Falls back to local storage if GitHub fails or isn't configured
- Local artifacts served via HTTP endpoint on registry server

REQUIREMENTS:
- For GitHub storage: repo must be set + 'gh auth login' or GITHUB_TOKEN
- For local storage: no requirements (automatic fallback)

CONTENT SOURCE (specify via 'source' field):
- source='file' + filePath: Local file path (e.g., "/path/to/screenshot.png") - RECOMMENDED
- source='url' + contentUrl: URL to fetch content from
- source='base64' + content: Base64 encoded (legacy)

DELIVERABLE LINKING:
- Pass deliverableId to link artifact to a deliverable
- If using Claude Code hooks, deliverable IDs are provided after plan approval
- Otherwise, call read_plan to get deliverable IDs

ARTIFACT TYPES:
- screenshot: PNG, JPG images of UI, terminal output
- video: MP4 recordings of feature demos
- test_results: JSON test output, coverage reports
- diff: Code changes, git diffs`,
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string", description: "The plan ID to add artifact to" },
        sessionToken: { type: "string", description: "Session token from create_plan" },
        type: {
          type: "string",
          enum: ["screenshot", "video", "test_results", "diff"],
          description: "Artifact type for rendering"
        },
        filename: {
          type: "string",
          description: "Filename with extension (e.g., screenshot.png, demo.mp4)"
        },
        source: {
          type: "string",
          enum: ["file", "url", "base64"],
          description: "Content source type: file (local path), url (fetch from URL), or base64 (direct content)"
        },
        filePath: {
          type: "string",
          description: "Local file path to upload (required when source=file)"
        },
        contentUrl: {
          type: "string",
          description: "URL to fetch content from (required when source=url)"
        },
        content: {
          type: "string",
          description: "Base64 encoded file content (required when source=base64)"
        },
        description: {
          type: "string",
          description: "Human-readable description of what this artifact proves"
        },
        deliverableId: {
          type: "string",
          description: "ID of the deliverable this fulfills (from read_plan output). Automatically marks deliverable as completed."
        }
      },
      required: ["planId", "sessionToken", "type", "filename", "source"]
    }
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handler has necessary validation and error handling for artifact uploads
  handler: async (args) => {
    const input = AddArtifactInput.parse(args);
    const { planId, sessionToken, type, filename } = input;
    const actorName = await getGitHubUsername();
    logger.info({ planId, type, filename }, "Adding artifact");
    let content;
    switch (input.source) {
      case "file": {
        logger.info({ filePath: input.filePath }, "Reading file from path");
        try {
          const fileBuffer = await readFile3(input.filePath);
          content = fileBuffer.toString("base64");
        } catch (error) {
          logger.error({ error, filePath: input.filePath }, "Failed to read file");
          const message = error instanceof Error ? error.message : "Unknown error";
          return {
            content: [{ type: "text", text: `Failed to read file: ${message}` }],
            isError: true
          };
        }
        break;
      }
      case "url": {
        logger.info({ contentUrl: input.contentUrl }, "Fetching content from URL");
        try {
          const response = await fetch(input.contentUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          content = Buffer.from(arrayBuffer).toString("base64");
        } catch (error) {
          logger.error({ error, contentUrl: input.contentUrl }, "Failed to fetch URL");
          const message = error instanceof Error ? error.message : "Unknown error";
          return {
            content: [{ type: "text", text: `Failed to fetch URL: ${message}` }],
            isError: true
          };
        }
        break;
      }
      case "base64": {
        content = input.content;
        break;
      }
      default: {
        const _exhaustive = input;
        throw new Error(`Unhandled source type: ${JSON.stringify(_exhaustive)}`);
      }
    }
    if (!isArtifactsEnabled()) {
      return {
        content: [
          {
            type: "text",
            text: "Artifact uploads are disabled.\n\nTo enable, set SHIPYARD_ARTIFACTS=enabled in your .mcp.json env config."
          }
        ],
        isError: true
      };
    }
    const doc = await getOrCreateDoc3(planId);
    const metadata = getPlanMetadata(doc);
    if (!metadata) {
      return {
        content: [{ type: "text", text: `Plan "${planId}" not found.` }],
        isError: true
      };
    }
    if (!metadata.sessionTokenHash || !verifySessionToken(sessionToken, metadata.sessionTokenHash)) {
      return {
        content: [{ type: "text", text: `Invalid session token for plan "${planId}".` }],
        isError: true
      };
    }
    let artifact;
    let cleanupOnFailure = null;
    const githubConfigured = isGitHubConfigured();
    const hasRepo = !!metadata.repo;
    try {
      if (githubConfigured && hasRepo) {
        try {
          const url = await uploadArtifact({
            repo: metadata.repo,
            planId,
            filename,
            content
          });
          artifact = {
            id: nanoid4(),
            type,
            filename,
            storage: "github",
            url,
            description: input.description,
            uploadedAt: Date.now()
          };
          logger.info({ planId, artifactId: artifact.id }, "Artifact uploaded to GitHub");
        } catch (error) {
          logger.warn({ error, planId }, "GitHub upload failed, falling back to local storage");
          const buffer = Buffer.from(content, "base64");
          const localArtifactId = await storeLocalArtifact(planId, filename, buffer);
          artifact = {
            id: nanoid4(),
            type,
            filename,
            storage: "local",
            localArtifactId,
            description: input.description,
            uploadedAt: Date.now()
          };
          cleanupOnFailure = async () => {
            await deleteLocalArtifact(localArtifactId);
          };
          logger.info(
            { planId, artifactId: artifact.id },
            "Artifact stored locally (GitHub fallback)"
          );
        }
      } else {
        const buffer = Buffer.from(content, "base64");
        const localArtifactId = await storeLocalArtifact(planId, filename, buffer);
        artifact = {
          id: nanoid4(),
          type,
          filename,
          storage: "local",
          localArtifactId,
          description: input.description,
          uploadedAt: Date.now()
        };
        cleanupOnFailure = async () => {
          await deleteLocalArtifact(localArtifactId);
        };
        const reason = !githubConfigured ? "GitHub not configured" : "No repo set";
        logger.info({ planId, artifactId: artifact.id, reason }, "Artifact stored locally");
      }
      addArtifact(doc, artifact, actorName);
      let statusChanged = false;
      if (input.deliverableId) {
        const linked = linkArtifactToDeliverable(doc, input.deliverableId, artifact.id, actorName);
        if (linked) {
          logPlanEvent(doc, "deliverable_linked", actorName, {
            deliverableId: input.deliverableId,
            artifactId: artifact.id
          });
          logger.info(
            { planId, artifactId: artifact.id, deliverableId: input.deliverableId },
            "Artifact linked to deliverable"
          );
          if (metadata.status === "draft") {
            const transitionResult = transitionPlanStatus(
              doc,
              {
                status: "in_progress",
                reviewedAt: Date.now(),
                reviewedBy: actorName
              },
              actorName
            );
            if (!transitionResult.success) {
              logger.warn(
                { planId, error: transitionResult.error },
                "Failed to auto-progress status to in_progress"
              );
            }
            const editor = ServerBlockNoteEditor2.create();
            const fragment = doc.getXmlFragment("document");
            const blocks = editor.yXmlFragmentToBlocks(fragment);
            const snapshot = createPlanSnapshot(
              doc,
              "First deliverable linked",
              actorName,
              "in_progress",
              blocks
            );
            addSnapshot(doc, snapshot);
            statusChanged = true;
            logger.info({ planId }, "Plan status auto-changed to in_progress");
          }
        } else {
          logger.warn(
            { planId, deliverableId: input.deliverableId },
            "Failed to link artifact: deliverable not found"
          );
        }
      }
      const artifactUrl = artifact.storage === "github" ? artifact.url : `http://localhost:${registryConfig.REGISTRY_PORT}/artifacts/${artifact.localArtifactId}`;
      logger.info({ planId, artifactId: artifact.id, url: artifactUrl }, "Artifact added");
      const linkedText = input.deliverableId ? `
Linked to deliverable: ${input.deliverableId}` : "";
      const deliverables = getDeliverables(doc);
      const allFulfilled = deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);
      if (allFulfilled) {
        logger.info({ planId }, "All deliverables fulfilled, auto-completing task");
        let linkedPR = null;
        const existingLinkedPRs = getLinkedPRs(doc);
        if (metadata.repo && existingLinkedPRs.length === 0) {
          linkedPR = await tryAutoLinkPR(doc, metadata.repo);
          if (linkedPR) {
            logger.info(
              { planId, prNumber: linkedPR.prNumber, branch: linkedPR.branch },
              "Auto-linked PR from current branch"
            );
          }
        }
        const editor = ServerBlockNoteEditor2.create();
        const fragment = doc.getXmlFragment("document");
        const blocks = editor.yXmlFragmentToBlocks(fragment);
        const artifacts = getArtifacts(doc);
        const completionSnapshot = createPlanSnapshot(
          doc,
          "Task completed - all deliverables fulfilled",
          actorName,
          "completed",
          blocks
        );
        addSnapshot(doc, completionSnapshot);
        const allSnapshots = getSnapshots(doc);
        const baseUrl = webConfig.SHIPYARD_WEB_URL;
        const snapshotUrl = createPlanUrlWithHistory(
          baseUrl,
          {
            id: planId,
            title: metadata.title,
            status: "completed",
            repo: metadata.repo,
            pr: metadata.pr,
            content: blocks,
            artifacts,
            deliverables
          },
          allSnapshots
        );
        const completedAt = Date.now();
        transitionPlanStatus(
          doc,
          {
            status: "completed",
            completedAt,
            completedBy: actorName,
            snapshotUrl
          },
          actorName
        );
        logPlanEvent(doc, "completed", actorName);
        const indexDoc = await getOrCreateDoc3(PLAN_INDEX_DOC_NAME);
        if (metadata.ownerId) {
          setPlanIndexEntry(indexDoc, {
            id: metadata.id,
            title: metadata.title,
            status: "completed",
            createdAt: metadata.createdAt ?? Date.now(),
            updatedAt: Date.now(),
            ownerId: metadata.ownerId,
            deleted: false
          });
        } else {
          logger.warn({ planId }, "Cannot update plan index: missing ownerId");
        }
        logger.info({ planId, snapshotUrl }, "Task auto-completed");
        let prText = "";
        if (linkedPR) {
          prText = `

PR linked: #${linkedPR.prNumber} (${linkedPR.status})
Branch: ${linkedPR.branch}
URL: ${linkedPR.url}`;
        } else if (existingLinkedPRs.length > 0) {
          prText = `

Existing linked PR: #${existingLinkedPRs[0]?.prNumber}`;
        }
        cleanupOnFailure = null;
        return {
          content: [
            {
              type: "text",
              text: `Artifact uploaded!
ID: ${artifact.id}
Type: ${type}
Filename: ${filename}
URL: ${artifactUrl}${linkedText}

\u{1F389} ALL DELIVERABLES COMPLETE! Task auto-completed.

Snapshot URL: ${snapshotUrl}${prText}

Embed this snapshot URL in your PR description as proof of completed work.`
            }
          ]
        };
      }
      const statusText = statusChanged ? "\nStatus: draft \u2192 in_progress (auto-updated)" : "";
      const remainingCount = deliverables.filter((d) => !d.linkedArtifactId).length;
      const remainingText = remainingCount > 0 ? `

${remainingCount} deliverable(s) remaining.` : "";
      cleanupOnFailure = null;
      return {
        content: [
          {
            type: "text",
            text: `Artifact uploaded!
ID: ${artifact.id}
Type: ${type}
Filename: ${filename}
URL: ${artifactUrl}${linkedText}${statusText}${remainingText}`
          }
        ]
      };
    } catch (error) {
      logger.error({ error, planId, filename }, "Failed to add artifact to Y.Doc");
      if (cleanupOnFailure) {
        await cleanupOnFailure();
      }
      if (error instanceof GitHubAuthError) {
        return {
          content: [
            {
              type: "text",
              text: `GitHub Authentication Error

${error.message}`
            }
          ],
          isError: true
        };
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text",
            text: `Failed to upload artifact: ${message}`
          }
        ],
        isError: true
      };
    }
  }
};
async function tryAutoLinkPR(ydoc, repo) {
  let branch;
  try {
    branch = execSync("git branch --show-current", {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    logger.debug({ error }, "Could not detect current git branch");
    return null;
  }
  if (!branch) {
    logger.debug("Not on a branch (possibly detached HEAD)");
    return null;
  }
  const octokit = getOctokit();
  if (!octokit) {
    logger.debug("No GitHub token available for PR lookup");
    return null;
  }
  const { owner, repoName } = parseRepoString(repo);
  try {
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo: repoName,
      head: `${owner}:${branch}`,
      state: "open"
    });
    if (prs.length === 0) {
      logger.debug({ branch, repo }, "No open PR found on branch");
      return null;
    }
    const pr = prs[0];
    if (!pr) return null;
    const validatedPR = GitHubPRResponseSchema.parse(pr);
    const prState = validatedPR.state;
    switch (prState) {
      case "open": {
        const linkedPR = createLinkedPR({
          prNumber: validatedPR.number,
          url: validatedPR.html_url,
          status: validatedPR.draft ? "draft" : "open",
          branch,
          title: validatedPR.title
        });
        const actorName = await getGitHubUsername();
        linkPR(ydoc, linkedPR, actorName);
        logPlanEvent(ydoc, "pr_linked", actorName, {
          prNumber: linkedPR.prNumber,
          url: linkedPR.url
        });
        return linkedPR;
      }
      case "closed":
        logger.warn({ prNumber: validatedPR.number }, "PR is already closed, not linking");
        return null;
      default: {
        const _exhaustive = prState;
        logger.error({ state: _exhaustive }, "Unhandled PR state");
        return null;
      }
    }
  } catch (error) {
    if (error instanceof z3.ZodError) {
      const fieldErrors = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
      logger.error({ fieldErrors, repo, branch }, "Invalid GitHub PR response during auto-link");
      return null;
    }
    logger.warn({ error, repo, branch }, "Failed to lookup PR from GitHub");
    return null;
  }
}

// src/tools/add-pr-review-comment.ts
import { nanoid as nanoid5 } from "nanoid";
import { z as z4 } from "zod";
var AddPRReviewCommentInput = z4.object({
  planId: z4.string().describe("Plan ID"),
  sessionToken: z4.string().describe("Session token from create_plan"),
  prNumber: z4.number().describe("PR number to comment on"),
  path: z4.string().describe("File path in the diff"),
  line: z4.number().describe("Line number in the modified file"),
  body: z4.string().describe("Comment content (markdown supported)")
});
var addPRReviewCommentTool = {
  definition: {
    name: TOOL_NAMES.ADD_PR_REVIEW_COMMENT,
    description: `Add a review comment to a PR diff.

Allows AI to provide feedback on code changes in linked PRs.
Comments appear inline in the Changes tab.

USAGE:
- Requires a linked PR (check via read_plan with includeLinkedPRs)
- path: File path (e.g., "src/components/Button.tsx")
- line: Line number in the MODIFIED file (not diff line)
- body: Comment content (supports markdown)

EXAMPLE:
add_pr_review_comment({
  planId: "abc123",
  sessionToken: "token",
  prNumber: 42,
  path: "src/utils/validator.ts",
  line: 25,
  body: "Consider adding input validation here to prevent XSS."
})`,
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string", description: "Plan ID" },
        sessionToken: { type: "string", description: "Session token from create_plan" },
        prNumber: { type: "number", description: "PR number to comment on" },
        path: { type: "string", description: "File path in the diff" },
        line: { type: "number", description: "Line number in modified file" },
        body: { type: "string", description: "Comment content (markdown supported)" }
      },
      required: ["planId", "sessionToken", "prNumber", "path", "line", "body"]
    }
  },
  handler: async (args) => {
    const input = AddPRReviewCommentInput.parse(args);
    logger.info(
      { planId: input.planId, prNumber: input.prNumber, path: input.path, line: input.line },
      "Adding PR review comment"
    );
    const ydoc = await getOrCreateDoc3(input.planId);
    const metadata = getPlanMetadata(ydoc);
    if (!metadata) {
      return {
        content: [{ type: "text", text: `Plan "${input.planId}" not found.` }],
        isError: true
      };
    }
    if (!metadata.sessionTokenHash || !verifySessionToken(input.sessionToken, metadata.sessionTokenHash)) {
      return {
        content: [{ type: "text", text: `Invalid session token for plan "${input.planId}".` }],
        isError: true
      };
    }
    const actorName = await getGitHubUsername();
    const comment = {
      id: nanoid5(),
      prNumber: input.prNumber,
      path: input.path,
      line: input.line,
      body: input.body,
      author: "AI",
      createdAt: Date.now(),
      resolved: false
    };
    addPRReviewComment(ydoc, comment, actorName);
    logPlanEvent(ydoc, "comment_added", actorName, {
      commentId: comment.id,
      prNumber: input.prNumber
    });
    logger.info(
      { planId: input.planId, commentId: comment.id, prNumber: input.prNumber },
      "PR review comment added"
    );
    return {
      content: [
        {
          type: "text",
          text: `Review comment added!

Comment ID: ${comment.id}
PR: #${input.prNumber}
File: ${input.path}:${input.line}

The comment will appear in the Changes tab when viewing this PR.`
        }
      ]
    };
  }
};

// src/tools/complete-task.ts
import { execSync as execSync2 } from "child_process";
import { ServerBlockNoteEditor as ServerBlockNoteEditor3 } from "@blocknote/server-util";
import { z as z5 } from "zod";
var CompleteTaskInput = z5.object({
  planId: z5.string().describe("ID of the plan to complete"),
  sessionToken: z5.string().describe("Session token from create_plan"),
  summary: z5.string().optional().describe("Optional completion summary")
});
var completeTaskTool = {
  definition: {
    name: TOOL_NAMES.COMPLETE_TASK,
    description: `Mark a task as complete and generate a snapshot URL for embedding in a PR.

NOTE: You usually DON'T need this tool! When you use add_artifact to upload proof for ALL deliverables, the task auto-completes and returns the snapshot URL automatically.

USE THIS TOOL ONLY IF:
- You need to force completion without all deliverables fulfilled
- The plan has no deliverables marked
- Auto-complete didn't trigger for some reason

REQUIREMENTS:
- Plan status must be 'in_progress'
- At least one artifact should be uploaded

RETURNS:
- Snapshot URL with complete plan state embedded
- Auto-links PR from current git branch if available`,
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string", description: "ID of the plan to complete" },
        sessionToken: { type: "string", description: "Session token from create_plan" },
        summary: {
          type: "string",
          description: "Optional completion summary for PR description"
        }
      },
      required: ["planId", "sessionToken"]
    }
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tool handler requires validation, auto-linking, and response formatting
  handler: async (args) => {
    const input = CompleteTaskInput.parse(args);
    const ydoc = await getOrCreateDoc3(input.planId);
    const metadata = getPlanMetadata(ydoc);
    if (!metadata) {
      return {
        content: [{ type: "text", text: "Plan not found" }],
        isError: true
      };
    }
    if (!metadata.sessionTokenHash || !verifySessionToken(input.sessionToken, metadata.sessionTokenHash)) {
      return {
        content: [{ type: "text", text: `Invalid session token for plan "${input.planId}".` }],
        isError: true
      };
    }
    if (metadata.status !== "in_progress") {
      return {
        content: [
          {
            type: "text",
            text: `Cannot complete: plan status is '${metadata.status}', must be 'in_progress'`
          }
        ],
        isError: true
      };
    }
    const artifacts = getArtifacts(ydoc);
    if (artifacts.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Cannot complete: no deliverables attached. Upload artifacts first using add_artifact."
          }
        ],
        isError: true
      };
    }
    const deliverables = getDeliverables(ydoc);
    let linkedPR = null;
    const existingLinkedPRs = getLinkedPRs(ydoc);
    if (metadata.repo && existingLinkedPRs.length === 0) {
      linkedPR = await tryAutoLinkPR2(ydoc, metadata.repo);
      if (linkedPR) {
        logger.info(
          { planId: input.planId, prNumber: linkedPR.prNumber, branch: linkedPR.branch },
          "Auto-linked PR from current branch"
        );
      }
    }
    const editor = ServerBlockNoteEditor3.create();
    const fragment = ydoc.getXmlFragment("document");
    const blocks = editor.yXmlFragmentToBlocks(fragment);
    const actorName = await getGitHubUsername();
    const completionSnapshot = createPlanSnapshot(
      ydoc,
      "Task marked complete",
      actorName,
      "completed",
      blocks
    );
    addSnapshot(ydoc, completionSnapshot);
    const allSnapshots = getSnapshots(ydoc);
    const baseUrl = webConfig.SHIPYARD_WEB_URL;
    const snapshotUrl = createPlanUrlWithHistory(
      baseUrl,
      {
        id: input.planId,
        title: metadata.title,
        status: "completed",
        repo: metadata.repo,
        pr: metadata.pr,
        content: blocks,
        artifacts,
        deliverables
      },
      allSnapshots
    );
    const completedAt = Date.now();
    transitionPlanStatus(
      ydoc,
      {
        status: "completed",
        completedAt,
        completedBy: actorName,
        snapshotUrl
      },
      actorName
    );
    logPlanEvent(ydoc, "completed", actorName);
    const indexDoc = await getOrCreateDoc3(PLAN_INDEX_DOC_NAME);
    if (metadata.ownerId) {
      setPlanIndexEntry(indexDoc, {
        id: metadata.id,
        title: metadata.title,
        status: "completed",
        createdAt: metadata.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        ownerId: metadata.ownerId,
        deleted: false
      });
    } else {
      logger.warn({ planId: input.planId }, "Cannot update plan index: missing ownerId");
    }
    logger.info({ planId: input.planId }, "Task marked complete");
    let responseText = `Task completed!

Snapshot URL: ${snapshotUrl}`;
    if (linkedPR) {
      responseText += `

Linked PR: #${linkedPR.prNumber} (${linkedPR.status})
Branch: ${linkedPR.branch}
URL: ${linkedPR.url}

The PR is now visible in the "Changes" tab of your plan.`;
    } else if (!metadata.repo) {
      responseText += `

Note: No PR auto-linked (plan has no repo set).`;
    } else if (existingLinkedPRs.length > 0) {
      responseText += `

Existing linked PR: #${existingLinkedPRs[0]?.prNumber}`;
    } else {
      responseText += `

No open PR found on current branch. You can:

1. Create a new PR:
\`\`\`
gh pr create --title "${metadata.title}" --body "## Summary
${input.summary || "Task completed."}

## Deliverables
[View Plan + Artifacts](${snapshotUrl})

---
Generated with [Shipyard](https://github.com/SchoolAI/shipyard)"
\`\`\`

2. Or link an existing PR manually:
\`\`\`
linkPR({ planId, sessionToken, prNumber: 42 })
\`\`\``;
    }
    return {
      content: [{ type: "text", text: responseText }]
    };
  }
};
async function tryAutoLinkPR2(ydoc, repo) {
  let branch;
  try {
    branch = execSync2("git branch --show-current", {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    logger.debug({ error }, "Could not detect current git branch");
    return null;
  }
  if (!branch) {
    logger.debug("Not on a branch (possibly detached HEAD)");
    return null;
  }
  const octokit = getOctokit();
  if (!octokit) {
    logger.debug("No GitHub token available for PR lookup");
    return null;
  }
  const { owner, repoName } = parseRepoString(repo);
  try {
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo: repoName,
      head: `${owner}:${branch}`,
      state: "open"
    });
    if (prs.length === 0) {
      logger.debug({ branch, repo }, "No open PR found on branch");
      return null;
    }
    const pr = prs[0];
    if (!pr) return null;
    const validatedPR = GitHubPRResponseSchema.parse(pr);
    const linkedPR = createLinkedPR({
      prNumber: validatedPR.number,
      url: validatedPR.html_url,
      // We query for state: 'open' only, so merged/closed are never returned
      status: validatedPR.draft ? "draft" : "open",
      branch,
      title: validatedPR.title
    });
    const actorName = await getGitHubUsername();
    linkPR(ydoc, linkedPR, actorName);
    logPlanEvent(ydoc, "pr_linked", actorName, {
      prNumber: linkedPR.prNumber,
      url: linkedPR.url
    });
    return linkedPR;
  } catch (error) {
    if (error instanceof z5.ZodError) {
      const fieldErrors = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
      logger.error({ fieldErrors, repo, branch }, "Invalid GitHub PR response during auto-link");
      return null;
    }
    logger.warn({ error, repo, branch }, "Failed to lookup PR from GitHub");
    return null;
  }
}

// src/tools/create-plan.ts
import { ServerBlockNoteEditor as ServerBlockNoteEditor4 } from "@blocknote/server-util";
import { nanoid as nanoid6 } from "nanoid";
import open2 from "open";
import { z as z6 } from "zod";
var OriginPlatformEnum = z6.enum(["devin", "cursor", "windsurf", "aider", "unknown"]);
var CreatePlanInput = z6.object({
  title: z6.string().describe("Plan title"),
  content: z6.string().describe("Plan content (markdown)"),
  repo: z6.string().optional().describe("GitHub repo (org/repo)"),
  prNumber: z6.number().optional().describe("PR number"),
  // Origin tracking for conversation export (Issue #41)
  originPlatform: OriginPlatformEnum.optional().describe(
    "Platform where this plan originated (for conversation export)"
  ),
  originSessionId: z6.string().optional().describe("Platform-specific session ID"),
  originMetadata: z6.record(z6.string(), z6.unknown()).optional().describe("Platform-specific metadata for conversation export"),
  // Tags for organization (Issue #37)
  tags: z6.array(z6.string()).optional().describe('Tags for categorization (e.g., ["ui", "bug", "project:mobile-app"])')
});
function buildOriginMetadata(platform, sessionId, metadata) {
  if (!platform || !sessionId) return void 0;
  switch (platform) {
    case "devin":
      return { platform: "devin", sessionId };
    case "cursor":
      return {
        platform: "cursor",
        conversationId: sessionId,
        generationId: metadata?.generationId
      };
    case "windsurf":
    case "aider":
    case "unknown":
      return { platform: "unknown" };
    default: {
      const _exhaustive = platform;
      void _exhaustive;
      return { platform: "unknown" };
    }
  }
}
function initializePlanContent(ydoc, blocks, ownerId) {
  const editor = ServerBlockNoteEditor4.create();
  ydoc.transact(
    () => {
      const fragment = ydoc.getXmlFragment("document");
      while (fragment.length > 0) {
        fragment.delete(0, 1);
      }
      editor.blocksToYXmlFragment(blocks, fragment);
      const deliverables = extractDeliverables(blocks);
      for (const deliverable of deliverables) {
        addDeliverable(ydoc, deliverable);
      }
      if (deliverables.length > 0) {
        logger.info({ count: deliverables.length }, "Deliverables extracted and stored");
      }
      logPlanEvent(ydoc, "plan_created", ownerId ?? "unknown");
    },
    { actor: ownerId ?? "unknown" }
  );
}
async function openPlanInBrowser(planId, url) {
  const indexDoc = await getOrCreateDoc3(PLAN_INDEX_DOC_NAME);
  if (await hasActiveConnections2(PLAN_INDEX_DOC_NAME)) {
    indexDoc.getMap("navigation").set("target", planId);
    logger.info({ url, planId }, "Browser already connected, navigating via CRDT");
  } else {
    await open2(url);
    logger.info({ url }, "Browser launched");
  }
}
var createPlanTool = {
  definition: {
    name: TOOL_NAMES.CREATE_PLAN,
    description: `Create a new implementation task and open it in browser.

NOTE FOR CLAUDE CODE USERS: If you have the shipyard hook installed, use native plan mode (Shift+Tab) instead of this tool. The hook handles task creation automatically and provides a better experience.

This tool is for agents WITHOUT hook support (Cursor, Devin, etc).

DELIVERABLES: Mark checkbox items as deliverables using {#deliverable} marker. Deliverables are measurable outcomes you can prove with artifacts.

Good deliverables (provable with artifacts):
- [ ] Screenshot of working feature {#deliverable}
- [ ] Video demo of user flow {#deliverable}
- [ ] Test results showing all tests pass {#deliverable}

Bad deliverables (not provable):
- [ ] Implement the API  \u2190 This is a task, not a deliverable
- [ ] Add error handling \u2190 Can't prove this with an artifact`,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        content: {
          type: "string",
          description: "Task content in markdown. Use {#deliverable} marker on checkbox items to mark them as deliverables that can be linked to artifacts."
        },
        repo: {
          type: "string",
          description: "GitHub repo (org/repo). Auto-detected from current directory if not provided. Required for artifact uploads."
        },
        prNumber: { type: "number", description: "PR number. Required for artifact uploads." },
        // Origin tracking for conversation export (Issue #41)
        originPlatform: {
          type: "string",
          enum: ["devin", "cursor", "windsurf", "aider", "unknown"],
          description: "Platform where this plan originated. Used for conversation export/import."
        },
        originSessionId: {
          type: "string",
          description: "Platform-specific session ID. Include this so conversation history can be exported later."
        },
        originMetadata: {
          type: "object",
          description: "Platform-specific metadata for conversation export."
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: 'Tags for categorization (e.g., ["ui", "bug", "project:mobile-app"]). Use conventions like "project:name" for grouping.'
        }
      },
      required: ["title", "content"]
    }
  },
  handler: async (args) => {
    const input = CreatePlanInput.parse(args);
    const planId = nanoid6();
    const sessionToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken);
    const now = Date.now();
    const repo = input.repo || getRepositoryFullName() || void 0;
    if (repo && !input.repo) {
      logger.info({ repo }, "Auto-detected repository from current directory");
    }
    logger.info({ planId, title: input.title, repo }, "Creating plan");
    const ydoc = await getOrCreateDoc3(planId);
    const ownerId = await getGitHubUsername();
    logger.info({ ownerId }, "GitHub username for plan ownership");
    const origin = buildOriginMetadata(
      input.originPlatform,
      input.originSessionId,
      input.originMetadata
    );
    initPlanMetadata(ydoc, {
      id: planId,
      title: input.title,
      repo,
      pr: input.prNumber,
      ownerId,
      sessionTokenHash,
      origin,
      tags: input.tags
    });
    const transitionResult = transitionPlanStatus(
      ydoc,
      { status: "pending_review", reviewRequestId: nanoid6() },
      ownerId ?? "unknown"
    );
    if (!transitionResult.success) {
      logger.error(
        { error: transitionResult.error },
        "Failed to transition plan to pending_review"
      );
    }
    logger.info({ contentLength: input.content.length }, "About to parse markdown");
    const blocks = await parseMarkdownToBlocks2(input.content);
    logger.info({ blockCount: blocks.length }, "Parsed blocks, storing in Y.Doc");
    initializePlanContent(ydoc, blocks, ownerId);
    logger.info("Content stored in Y.Doc document fragment");
    const finalMetadata = getPlanMetadata(ydoc);
    if (!finalMetadata) {
      throw new Error("Failed to get plan metadata after initialization");
    }
    const indexDoc = await getOrCreateDoc3(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title: input.title,
      status: "pending_review",
      createdAt: now,
      updatedAt: finalMetadata.updatedAt,
      ownerId,
      tags: input.tags,
      deleted: false
    });
    logger.info({ planId }, "Plan index updated");
    const url = `http://localhost:5173/plan/${planId}`;
    await openPlanInBrowser(planId, url);
    const repoInfo = repo ? `Repo: ${repo}${!input.repo ? " (auto-detected)" : ""}` : "Repo: Not set (provide repo and prNumber for artifact uploads)";
    return {
      content: [
        {
          type: "text",
          text: `Plan created!
ID: ${planId}
Session Token: ${sessionToken}
${repoInfo}
URL: ${url}

IMPORTANT: Save the session token - it's required for add_artifact calls.

Next steps:
1. Wait for human to review and approve the plan in the browser
2. Once approved, use add_artifact to upload proof for each deliverable
3. When all deliverables have artifacts, the task auto-completes with a snapshot URL`
        }
      ]
    };
  }
};
async function parseMarkdownToBlocks2(markdown) {
  logger.info({ markdown: markdown.substring(0, 100) }, "Parsing markdown to blocks");
  try {
    const editor = ServerBlockNoteEditor4.create();
    const blocks = await editor.tryParseMarkdownToBlocks(markdown);
    logger.info(
      { blockCount: blocks.length, firstBlockType: blocks[0]?.type },
      "Markdown parsed to blocks"
    );
    return blocks;
  } catch (error) {
    logger.error(
      { error, markdown: markdown.substring(0, 100) },
      "Error parsing markdown to blocks"
    );
    throw error;
  }
}

// src/tools/link-pr.ts
import { z as z7 } from "zod";
var LinkPRInput = z7.object({
  planId: z7.string().describe("Plan ID"),
  sessionToken: z7.string().describe("Session token from create_plan"),
  prNumber: z7.number().describe("PR number to link"),
  branch: z7.string().optional().describe("Branch name (optional, will be fetched if omitted)"),
  repo: z7.string().optional().describe("Repository override (org/repo). Uses plan repo if omitted.")
});
var linkPRTool = {
  definition: {
    name: TOOL_NAMES.LINK_PR,
    description: `Link a GitHub PR to a plan.

Manually associate a PR with a plan. Useful when:
- PR was created after plan completion
- Multiple PRs implement parts of the same plan
- You want to link a PR in a different repo

USAGE:
- prNumber: The GitHub PR number
- repo (optional): Defaults to plan's repo. Use "owner/repo" format for cross-repo linking.
- branch (optional): Will be fetched from GitHub if not provided

The linked PR will appear in the plan's Changes tab with status, diff, and review comments.

EXAMPLE:
link_pr({
  planId: "abc123",
  sessionToken: "token",
  prNumber: 42
})`,
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string", description: "Plan ID" },
        sessionToken: { type: "string", description: "Session token from create_plan" },
        prNumber: { type: "number", description: "PR number to link" },
        branch: {
          type: "string",
          description: "Branch name (optional, will be fetched if omitted)"
        },
        repo: {
          type: "string",
          description: "Repository override (org/repo). Uses plan repo if omitted."
        }
      },
      required: ["planId", "sessionToken", "prNumber"]
    }
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tool handler requires validation, GitHub API call, error handling
  handler: async (args) => {
    const input = LinkPRInput.parse(args);
    logger.info(
      { planId: input.planId, prNumber: input.prNumber, repo: input.repo },
      "Linking PR to plan"
    );
    const ydoc = await getOrCreateDoc3(input.planId);
    const metadata = getPlanMetadata(ydoc);
    if (!metadata) {
      return {
        content: [{ type: "text", text: `Plan "${input.planId}" not found.` }],
        isError: true
      };
    }
    if (!metadata.sessionTokenHash || !verifySessionToken(input.sessionToken, metadata.sessionTokenHash)) {
      return {
        content: [{ type: "text", text: `Invalid session token for plan "${input.planId}".` }],
        isError: true
      };
    }
    const repo = input.repo || metadata.repo;
    if (!repo) {
      return {
        content: [
          {
            type: "text",
            text: "No repository specified. Provide repo parameter or set plan repo."
          }
        ],
        isError: true
      };
    }
    const octokit = getOctokit();
    if (!octokit) {
      return {
        content: [
          {
            type: "text",
            text: "GitHub authentication required. Set GITHUB_TOKEN environment variable or run: gh auth login"
          }
        ],
        isError: true
      };
    }
    const { owner, repoName } = parseRepoString(repo);
    try {
      const { data: pr } = await octokit.pulls.get({
        owner,
        repo: repoName,
        pull_number: input.prNumber
      });
      const validatedPR = GitHubPRResponseSchema.parse(pr);
      const linkedPR = createLinkedPR({
        prNumber: input.prNumber,
        url: validatedPR.html_url,
        status: validatedPR.merged ? "merged" : validatedPR.state === "closed" ? "closed" : validatedPR.draft ? "draft" : "open",
        branch: input.branch || validatedPR.head.ref,
        title: validatedPR.title
      });
      const actorName = await getGitHubUsername();
      linkPR(ydoc, linkedPR, actorName);
      logPlanEvent(ydoc, "pr_linked", actorName, {
        prNumber: linkedPR.prNumber,
        url: linkedPR.url
      });
      logger.info(
        { planId: input.planId, prNumber: input.prNumber, status: linkedPR.status },
        "PR linked successfully"
      );
      return {
        content: [
          {
            type: "text",
            text: `PR linked successfully!

PR: #${linkedPR.prNumber} - ${linkedPR.title}
Status: ${linkedPR.status}
Branch: ${linkedPR.branch}
URL: ${linkedPR.url}

The PR is now visible in the "Changes" tab of your plan.`
          }
        ]
      };
    } catch (error) {
      logger.error({ error, planId: input.planId, prNumber: input.prNumber }, "Failed to link PR");
      if (error instanceof z7.ZodError) {
        const fieldErrors = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
        return {
          content: [
            {
              type: "text",
              text: `GitHub API returned invalid data for PR #${input.prNumber}

Validation errors: ${fieldErrors}

This usually means GitHub's API response is missing required fields or has unexpected values.`
            }
          ],
          isError: true
        };
      }
      const message = error instanceof Error ? error.message : "Unknown error while fetching PR from GitHub";
      return {
        content: [
          {
            type: "text",
            text: `Failed to link PR #${input.prNumber}: ${message}

Make sure:
- The PR exists in the repository
- You have access to the repository
- GitHub token has correct permissions`
          }
        ],
        isError: true
      };
    }
  }
};

// src/tools/read-plan.ts
import { z as z8 } from "zod";

// src/export-markdown.ts
import { ServerBlockNoteEditor as ServerBlockNoteEditor5 } from "@blocknote/server-util";
var THREAD_MARK_ATTRS = {
  COMMENT_THREAD_MARK: "commentThreadMark",
  THREAD_MARK: "threadMark",
  COMMENT_THREAD: "commentThread"
};
async function exportPlanToMarkdown(ydoc, options = {}) {
  const { includeResolved = false, selectedTextMaxLength = 100 } = options;
  const editor = ServerBlockNoteEditor5.create();
  const fragment = ydoc.getXmlFragment("document");
  const blocks = editor.yXmlFragmentToBlocks(fragment);
  const markdownParts = [];
  for (const block of blocks) {
    markdownParts.push(`<!-- block:${block.id} -->`);
    const blockMarkdown = await editor.blocksToMarkdownLossy([block]);
    markdownParts.push(blockMarkdown);
  }
  const contentMarkdown = markdownParts.join("\n");
  const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
  const threadsData = threadsMap.toJSON();
  const allThreads = parseThreads(threadsData);
  const threadTextMap = extractThreadTextFromFragment(fragment);
  const threadsWithText = allThreads.map((thread) => ({
    ...thread,
    selectedText: thread.selectedText || threadTextMap.get(thread.id)
  }));
  const resolveUser = createUserResolver(ydoc);
  const feedbackMarkdown = formatFeedbackSection(
    threadsWithText,
    { includeResolved, selectedTextMaxLength },
    resolveUser
  );
  const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
  const reviewComment = metadataMap.get("reviewComment");
  const reviewedBy = metadataMap.get("reviewedBy");
  const sections = [contentMarkdown];
  if (reviewComment) {
    let reviewerSection = "## Reviewer Comment\n\n";
    reviewerSection += `> **${reviewedBy ?? "Reviewer"}:** ${reviewComment}
`;
    sections.push(reviewerSection);
  }
  if (feedbackMarkdown) {
    sections.push(feedbackMarkdown);
  }
  return sections.join("\n\n---\n\n");
}
function extractThreadTextFromFragment(fragment) {
  const threadTextMap = /* @__PURE__ */ new Map();
  for (const node of fragment.createTreeWalker(() => true)) {
    if (node.constructor.name === "YXmlText") {
      const textNode = node;
      const attrs = textNode.getAttributes();
      const threadId = extractThreadIdFromAttrs(attrs);
      if (threadId) {
        const text = textNode.toString();
        if (text) {
          const existing = threadTextMap.get(threadId) || "";
          threadTextMap.set(threadId, existing + text);
        }
      }
    }
  }
  return threadTextMap;
}
function extractThreadIdFromAttrs(attrs) {
  const primaryAttr = attrs[THREAD_MARK_ATTRS.COMMENT_THREAD_MARK];
  if (typeof primaryAttr === "string") {
    return primaryAttr;
  }
  if (typeof primaryAttr === "object" && primaryAttr && "id" in primaryAttr) {
    const id = primaryAttr.id;
    if (typeof id === "string") {
      return id;
    }
  }
  const altAttr1 = attrs[THREAD_MARK_ATTRS.THREAD_MARK];
  if (typeof altAttr1 === "string") {
    return altAttr1;
  }
  const altAttr2 = attrs[THREAD_MARK_ATTRS.COMMENT_THREAD];
  if (typeof altAttr2 === "string") {
    return altAttr2;
  }
  return null;
}
function formatFeedbackSection(threads, options = {}, resolveUser) {
  const { includeResolved = false, selectedTextMaxLength = 100 } = options;
  const unresolvedThreads = threads.filter((t) => !t.resolved);
  const resolvedCount = threads.length - unresolvedThreads.length;
  const threadsToShow = includeResolved ? threads : unresolvedThreads;
  if (threadsToShow.length === 0) {
    if (resolvedCount > 0) {
      return `## Reviewer Feedback

All ${resolvedCount} comment(s) have been resolved.`;
    }
    return "";
  }
  let output = "## Reviewer Feedback\n\n";
  threadsToShow.forEach((thread, index) => {
    output += formatThread(thread, index + 1, selectedTextMaxLength, resolveUser);
    output += "\n";
  });
  if (!includeResolved && resolvedCount > 0) {
    output += `---
*${resolvedCount} resolved comment(s) not shown*
`;
  }
  return output;
}
function formatThread(thread, number, selectedTextMaxLength, resolveUser) {
  let output = `### ${number}. `;
  if (thread.selectedText) {
    const preview = truncate(thread.selectedText, selectedTextMaxLength);
    output += `On: "${preview}"
`;
  } else {
    output += "General\n";
  }
  if (thread.resolved) {
    output += "*[Resolved]*\n";
  }
  thread.comments.forEach((comment, idx) => {
    const bodyText = extractTextFromCommentBody(comment.body);
    const authorName = resolveUser ? resolveUser(comment.userId) : comment.userId.slice(0, 8);
    if (idx === 0) {
      output += `> **${authorName}:** ${bodyText}
`;
    } else {
      output += `>
> **${authorName} (Reply):** ${bodyText}
`;
    }
  });
  return output;
}
function truncate(text, maxLength) {
  const cleaned = text.replace(/\n/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength)}...`;
}

// src/tools/read-plan.ts
var ReadPlanInput = z8.object({
  planId: z8.string().describe("The plan ID to read"),
  sessionToken: z8.string().describe("Session token from create_plan"),
  includeAnnotations: z8.boolean().optional().describe("Include comment threads/annotations in the response (default: false)"),
  includeLinkedPRs: z8.boolean().optional().describe("Include linked PRs section in the response (default: false)")
});
var readPlanTool = {
  definition: {
    name: TOOL_NAMES.READ_PLAN,
    description: `Read a specific task by ID, returning its metadata and content in markdown format.

NOTE FOR CLAUDE CODE USERS: If you just received task approval via the hook, deliverable IDs were already provided in the approval message. You only need this tool if:
- You need to check human feedback (set includeAnnotations=true)
- You need to refresh state after changes
- You need to see linked PRs (set includeLinkedPRs=true)

USE CASES:
- Review feedback from human reviewers (set includeAnnotations=true)
- Check task status and completion state
- Get block IDs for update_block_content operations
- View linked PRs and their status (set includeLinkedPRs=true)

OUTPUT INCLUDES:
- Metadata: title, status, repo, PR, timestamps
- Content: Full markdown with block IDs
- Deliverables section: Shows deliverable IDs and completion status
- Annotations: Comment threads if includeAnnotations=true
- Linked PRs: PR list with status, URL, branch if includeLinkedPRs=true`,
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string", description: "The task ID to read" },
        sessionToken: { type: "string", description: "Session token from create_plan" },
        includeAnnotations: {
          type: "boolean",
          description: "Include comment threads/annotations in the response (default: false). Set true to see human feedback."
        },
        includeLinkedPRs: {
          type: "boolean",
          description: "Include linked PRs section in the response (default: false). Set true to see linked PRs."
        }
      },
      required: ["planId", "sessionToken"]
    }
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tool handler requires session validation, markdown export with deliverables/annotations/linked PRs sections
  handler: async (args) => {
    const {
      planId,
      sessionToken,
      includeAnnotations = false,
      includeLinkedPRs = false
    } = ReadPlanInput.parse(args);
    const doc = await getOrCreateDoc3(planId);
    const metadata = getPlanMetadata(doc);
    if (!metadata) {
      return {
        content: [
          {
            type: "text",
            text: `Plan "${planId}" not found or has no metadata.`
          }
        ],
        isError: true
      };
    }
    if (!metadata.sessionTokenHash || !verifySessionToken(sessionToken, metadata.sessionTokenHash)) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid session token for plan "${planId}".`
          }
        ],
        isError: true
      };
    }
    const markdown = await exportPlanToMarkdown(doc, {
      includeResolved: includeAnnotations
      // Include resolved comments if showing annotations
    });
    let output = `# ${metadata.title}

`;
    output += `**Status:** ${metadata.status.replace("_", " ")}
`;
    if (metadata.repo) {
      output += `**Repo:** ${metadata.repo}
`;
    }
    if (metadata.pr) {
      output += `**PR:** #${metadata.pr}
`;
    }
    output += `**Created:** ${new Date(metadata.createdAt).toISOString()}
`;
    output += `**Updated:** ${new Date(metadata.updatedAt).toISOString()}
`;
    if (metadata.status === "changes_requested" && metadata.reviewComment) {
      output += `
**Reviewer Comment:** ${metadata.reviewComment}
`;
    }
    output += "\n---\n\n";
    output += markdown;
    const deliverables = getDeliverables(doc);
    const deliverablesText = formatDeliverablesForLLM(deliverables);
    if (deliverablesText) {
      output += "\n\n---\n\n";
      output += deliverablesText;
    }
    if (includeLinkedPRs) {
      const linkedPRs = getLinkedPRs(doc);
      if (linkedPRs.length > 0) {
        output += "\n\n---\n\n";
        output += "## Linked PRs\n\n";
        for (const pr of linkedPRs) {
          output += `- **#${pr.prNumber}** (${pr.status})`;
          if (pr.title) {
            output += ` - ${pr.title}`;
          }
          output += "\n";
          output += `  - URL: ${pr.url}
`;
          if (pr.branch) {
            output += `  - Branch: ${pr.branch}
`;
          }
          output += `  - Linked: ${new Date(pr.linkedAt).toISOString()}
`;
        }
      }
    }
    return {
      content: [
        {
          type: "text",
          text: output
        }
      ]
    };
  }
};

// src/tools/setup-review-notification.ts
import { z as z9 } from "zod";
var SetupReviewNotificationInput = z9.object({
  planId: z9.string().describe("Plan ID to monitor"),
  pollIntervalSeconds: z9.number().optional().default(30).describe("Polling interval in seconds (default: 30)")
});
var setupReviewNotificationTool = {
  definition: {
    name: TOOL_NAMES.SETUP_REVIEW_NOTIFICATION,
    description: `Returns a bash script to monitor plan review status.

NOTE FOR CLAUDE CODE USERS: If you have the shipyard hook installed, you DON'T need this tool. The hook automatically blocks until the human approves or requests changes. This tool is only for agents WITHOUT hook support.

USAGE (for non-hook agents):
1. Call this tool to get monitoring script
2. Run script in background: bash <script> &
3. Script polls registry server for status changes
4. Exits when status becomes 'approved' or 'changes_requested'`,
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string", description: "Plan ID to monitor" },
        pollIntervalSeconds: {
          type: "number",
          description: "Polling interval in seconds (default: 30)"
        }
      },
      required: ["planId"]
    }
  },
  handler: async (args) => {
    const input = SetupReviewNotificationInput.parse(args);
    const { planId, pollIntervalSeconds = 30 } = input;
    const registryPort2 = registryConfig.REGISTRY_PORT[0];
    const trpcUrl = `http://localhost:${registryPort2}/trpc`;
    const script = `# Subscribe to status and comment changes via tRPC
CLIENT_ID=$(curl -sf -X POST "${trpcUrl}/subscription.create" \\
  -H "Content-Type: application/json" \\
  -d '{"planId":"${planId}","subscribe":["status","comments"],"windowMs":5000,"threshold":1}' \\
  | grep -o '"clientId":"[^"]*"' | cut -d'"' -f4)

echo "Subscribed. Monitoring plan..."

# Poll for changes via tRPC
while sleep ${pollIntervalSeconds}; do
  result=$(curl -sf -X POST "${trpcUrl}/subscription.getChanges" \\
    -H "Content-Type: application/json" \\
    -d '{"planId":"${planId}","clientId":"'"$CLIENT_ID"'"}' 2>/dev/null)
  ready=$(echo "$result" | grep -o '"ready":true')
  if [ -n "$ready" ]; then
    changes=$(echo "$result" | grep -o '"changes":"[^"]*"' | cut -d'"' -f4)
    echo "Changes: $changes"
    # Exit on status change to approved/changes_requested
    echo "$changes" | grep -qE "Status:.*(approved|changes_requested)" && exit 0
  fi
done`;
    return {
      content: [
        {
          type: "text",
          text: `Notification script for plan "${planId}":

\`\`\`bash
${script}
\`\`\`

> Subscribes to status and comment changes with server-side batching.
> Batching: 5s window or 1 change threshold (whichever comes first).
> Exits when status becomes approved/changes_requested.
> Most agent environments support background bash notifications.`
        }
      ]
    };
  }
};

// src/tools/update-block-content.ts
import { ServerBlockNoteEditor as ServerBlockNoteEditor6 } from "@blocknote/server-util";
import { z as z10 } from "zod";
var BlockOperationSchema = z10.discriminatedUnion("type", [
  z10.object({
    type: z10.literal("update"),
    blockId: z10.string().describe("The block ID to update (from read_plan output)"),
    content: z10.string().describe("New markdown content for this block")
  }),
  z10.object({
    type: z10.literal("insert"),
    afterBlockId: z10.string().nullable().describe("Insert after this block ID (null = insert at beginning)"),
    content: z10.string().describe("Markdown content to insert as new block(s)")
  }),
  z10.object({
    type: z10.literal("delete"),
    blockId: z10.string().describe("The block ID to delete")
  }),
  z10.object({
    type: z10.literal("replace_all"),
    content: z10.string().describe("Complete markdown content to replace the entire plan")
  })
]);
var UpdateBlockContentInput = z10.object({
  planId: z10.string().describe("The plan ID to modify"),
  sessionToken: z10.string().describe("Session token from create_plan"),
  operations: z10.array(BlockOperationSchema).min(1).describe("Array of operations to perform atomically")
});
var updateBlockContentTool = {
  definition: {
    name: TOOL_NAMES.UPDATE_BLOCK_CONTENT,
    description: `Modify task content by updating, inserting, or deleting specific blocks. Use read_plan first to get block IDs.

DELIVERABLES: When inserting/updating content, you can mark checkbox items as deliverables using {#deliverable} marker. These can later be linked to artifacts via add_artifact tool.

Operations:
- update: Replace an existing block with new markdown content
- insert: Add new blocks after a specific block (or at beginning if afterBlockId is null)
- delete: Remove a specific block
- replace_all: Replace entire task content with new markdown

Example with deliverables:
{ "type": "insert", "afterBlockId": "block-123", "content": "- [ ] Screenshot of feature {#deliverable}" }`,
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string", description: "The task ID to modify" },
        sessionToken: { type: "string", description: "Session token from create_plan" },
        operations: {
          type: "array",
          description: "Array of operations to perform atomically",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["update", "insert", "delete", "replace_all"],
                description: "Operation type"
              },
              blockId: {
                type: "string",
                description: "Block ID for update/delete operations (from read_plan output)"
              },
              afterBlockId: {
                type: "string",
                nullable: true,
                description: "Insert after this block ID (null = beginning)"
              },
              content: {
                type: "string",
                description: "Markdown content for update/insert/replace_all. Can include {#deliverable} markers on checkbox items."
              }
            },
            required: ["type"]
          }
        }
      },
      required: ["planId", "sessionToken", "operations"]
    }
  },
  handler: async (args) => {
    const input = UpdateBlockContentInput.parse(args);
    const { planId, sessionToken, operations } = input;
    logger.info({ planId, operationCount: operations.length }, "Updating block content");
    const ydoc = await getOrCreateDoc3(planId);
    const metadata = getPlanMetadata(ydoc);
    if (!metadata) {
      return {
        content: [{ type: "text", text: `Plan "${planId}" not found.` }],
        isError: true
      };
    }
    if (!metadata.sessionTokenHash || !verifySessionToken(sessionToken, metadata.sessionTokenHash)) {
      return {
        content: [{ type: "text", text: `Invalid session token for plan "${planId}".` }],
        isError: true
      };
    }
    const editor = ServerBlockNoteEditor6.create();
    const fragment = ydoc.getXmlFragment("document");
    let blocks = editor.yXmlFragmentToBlocks(fragment);
    if (blocks.length === 0 && !operations.some((op) => op.type === "replace_all")) {
      return {
        content: [
          {
            type: "text",
            text: `Plan "${planId}" has no content. Use replace_all to add content or create a new plan.`
          }
        ],
        isError: true
      };
    }
    const results = [];
    for (const operation of operations) {
      const result = await applyOperation(blocks, operation, editor);
      if (result.error) {
        return {
          content: [{ type: "text", text: result.error }],
          isError: true
        };
      }
      blocks = result.blocks;
      results.push(result.message);
    }
    const actorName = await getGitHubUsername();
    ydoc.transact(
      () => {
        while (fragment.length > 0) {
          fragment.delete(0, 1);
        }
        editor.blocksToYXmlFragment(blocks, fragment);
        setPlanMetadata(ydoc, {});
      },
      { actor: actorName }
    );
    const operationSummary = operations.length === 1 ? results[0] ?? "Content updated" : `${operations.length} operations: ${results.join(", ")}`;
    const snapshot = createPlanSnapshot(ydoc, operationSummary, actorName, metadata.status, blocks);
    addSnapshot(ydoc, snapshot);
    logger.info({ planId, snapshotId: snapshot.id }, "Content snapshot created");
    const indexDoc = await getOrCreateDoc3(PLAN_INDEX_DOC_NAME);
    touchPlanIndexEntry(indexDoc, planId);
    logger.info({ planId, results }, "Block content updated successfully");
    return {
      content: [
        {
          type: "text",
          text: `Updated plan "${planId}":
${results.map((r) => `- ${r}`).join("\n")}`
        }
      ]
    };
  }
};
function findBlockIndex(blocks, blockId) {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block && block.id === blockId) {
      return i;
    }
  }
  return -1;
}
function formatBlockIds(blocks) {
  return blocks.map((b) => b.id).join(", ");
}
function buildArrayWithReplacement(blocks, index, replacements) {
  const result = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i === index) {
      for (const r of replacements) result.push(r);
    } else {
      const block = blocks[i];
      if (block) result.push(block);
    }
  }
  return result;
}
function buildArrayWithInsertion(blocks, insertIndex, newBlocks) {
  const result = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i === insertIndex) {
      for (const n of newBlocks) result.push(n);
    }
    const block = blocks[i];
    if (block) result.push(block);
  }
  if (insertIndex >= blocks.length) {
    for (const n of newBlocks) result.push(n);
  }
  return result;
}
function buildArrayWithDeletion(blocks, deleteIndex) {
  const result = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i !== deleteIndex) {
      const block = blocks[i];
      if (block) result.push(block);
    }
  }
  return result;
}
async function applyUpdateOperation(blocks, blockId, content, editor) {
  const blockIndex = findBlockIndex(blocks, blockId);
  if (blockIndex === -1) {
    return {
      blocks,
      message: "",
      error: `Block "${blockId}" not found. Available IDs: ${formatBlockIds(blocks)}`
    };
  }
  const newBlocks = await editor.tryParseMarkdownToBlocks(content);
  if (newBlocks.length === 0) {
    return { blocks, message: "", error: `Could not parse content for block "${blockId}"` };
  }
  if (newBlocks.length === 1 && newBlocks[0]) {
    newBlocks[0].id = blockId;
  }
  return {
    blocks: buildArrayWithReplacement(blocks, blockIndex, newBlocks),
    message: `Updated block ${blockId}`
  };
}
async function applyInsertOperation(blocks, afterBlockId, content, editor) {
  const newBlocks = await editor.tryParseMarkdownToBlocks(content);
  if (newBlocks.length === 0) {
    return { blocks, message: "", error: "Could not parse content for insertion" };
  }
  let insertIndex;
  if (afterBlockId === null) {
    insertIndex = 0;
  } else {
    const afterIndex = findBlockIndex(blocks, afterBlockId);
    if (afterIndex === -1) {
      return {
        blocks,
        message: "",
        error: `Block "${afterBlockId}" not found. Available IDs: ${formatBlockIds(blocks)}`
      };
    }
    insertIndex = afterIndex + 1;
  }
  return {
    blocks: buildArrayWithInsertion(blocks, insertIndex, newBlocks),
    message: `Inserted ${newBlocks.length} block(s) after ${afterBlockId ?? "beginning"}`
  };
}
function applyDeleteOperation(blocks, blockId) {
  const blockIndex = findBlockIndex(blocks, blockId);
  if (blockIndex === -1) {
    return {
      blocks,
      message: "",
      error: `Block "${blockId}" not found. Available IDs: ${formatBlockIds(blocks)}`
    };
  }
  return {
    blocks: buildArrayWithDeletion(blocks, blockIndex),
    message: `Deleted block ${blockId}`
  };
}
async function applyReplaceAllOperation(content, editor) {
  const newBlocks = await editor.tryParseMarkdownToBlocks(content);
  return { blocks: newBlocks, message: `Replaced all content with ${newBlocks.length} block(s)` };
}
async function applyOperation(blocks, operation, editor) {
  switch (operation.type) {
    case "update":
      return applyUpdateOperation(blocks, operation.blockId, operation.content, editor);
    case "insert":
      return applyInsertOperation(blocks, operation.afterBlockId, operation.content, editor);
    case "delete":
      return applyDeleteOperation(blocks, operation.blockId);
    case "replace_all":
      return applyReplaceAllOperation(operation.content, editor);
    default: {
      const _exhaustive = operation;
      return {
        blocks,
        message: "",
        error: `Unknown operation type: ${JSON.stringify(_exhaustive)}`
      };
    }
  }
}

// src/tools/update-plan.ts
import { ServerBlockNoteEditor as ServerBlockNoteEditor7 } from "@blocknote/server-util";
import { z as z11 } from "zod";
var UpdatePlanInput = z11.object({
  planId: z11.string().describe("The plan ID to update"),
  sessionToken: z11.string().describe("Session token from create_plan"),
  title: z11.string().optional().describe("New title"),
  status: z11.enum(["draft", "pending_review", "changes_requested", "in_progress", "completed"]).optional().describe("New status"),
  tags: z11.array(z11.string()).optional().describe("Updated tags (replaces existing tags)")
});
var updatePlanTool = {
  definition: {
    name: TOOL_NAMES.UPDATE_PLAN,
    description: `Update an existing plan's metadata (title, status). Does not modify content\u2014use update_block_content for that.

NOTE: Most status transitions are automatic. You rarely need to call this tool.

AUTOMATIC TRANSITIONS:
- draft \u2192 in_progress/changes_requested: Set by human in browser
- in_progress \u2192 completed: Auto-set when all deliverables have artifacts

MANUAL USE CASES (rare):
- Resetting a plan to draft status
- Changing title after creation
- Edge cases where automatic transitions don't apply

STATUSES:
- draft: Initial state
- pending_review: Submitted for review
- changes_requested: Human requested modifications
- in_progress: Work started (usually auto-set)
- completed: All deliverables fulfilled (usually auto-set by add_artifact)`,
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string", description: "The plan ID to update" },
        sessionToken: { type: "string", description: "Session token from create_plan" },
        title: { type: "string", description: "New title (optional)" },
        status: {
          type: "string",
          enum: ["draft", "pending_review", "changes_requested", "in_progress", "completed"],
          description: "New status (optional). Use 'pending_review' to signal ready for human feedback."
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Updated tags (optional, replaces existing tags)"
        }
      },
      required: ["planId", "sessionToken"]
    }
  },
  handler: async (args) => {
    const input = UpdatePlanInput.parse(args);
    const doc = await getOrCreateDoc3(input.planId);
    const existingMetadata = getPlanMetadata(doc);
    const actorName = await getGitHubUsername();
    if (!existingMetadata) {
      return {
        content: [
          {
            type: "text",
            text: `Plan "${input.planId}" not found.`
          }
        ],
        isError: true
      };
    }
    if (!existingMetadata.sessionTokenHash || !verifySessionToken(input.sessionToken, existingMetadata.sessionTokenHash)) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid session token for plan "${input.planId}".`
          }
        ],
        isError: true
      };
    }
    const updates = {
      updatedAt: Date.now()
    };
    if (input.title) updates.title = input.title;
    if (input.status) updates.status = input.status;
    if (input.tags !== void 0) updates.tags = input.tags;
    const statusChanged = input.status && input.status !== existingMetadata.status;
    if (statusChanged && input.status) {
      const editor = ServerBlockNoteEditor7.create();
      const fragment = doc.getXmlFragment("document");
      const blocks = editor.yXmlFragmentToBlocks(fragment);
      const reason = `Status changed to ${input.status}`;
      const snapshot = createPlanSnapshot(doc, reason, actorName, input.status, blocks);
      addSnapshot(doc, snapshot);
    }
    setPlanMetadata(doc, updates, actorName);
    const indexDoc = await getOrCreateDoc3(PLAN_INDEX_DOC_NAME);
    if (existingMetadata.ownerId) {
      setPlanIndexEntry(indexDoc, {
        id: existingMetadata.id,
        title: input.title ?? existingMetadata.title,
        status: input.status ?? existingMetadata.status,
        createdAt: existingMetadata.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        ownerId: existingMetadata.ownerId,
        tags: input.tags ?? existingMetadata.tags,
        deleted: false
      });
    } else {
      logger.warn({ planId: input.planId }, "Cannot update plan index: missing ownerId");
    }
    logger.info({ planId: input.planId, updates }, "Plan updated");
    return {
      content: [
        {
          type: "text",
          text: `Plan "${input.planId}" updated successfully.`
        }
      ]
    };
  }
};

// src/tools/execute-code.ts
var BUNDLED_DOCS = `Execute TypeScript code that calls Shipyard APIs. Use this for multi-step workflows to reduce round-trips.

\u26A0\uFE0F IMPORTANT LIMITATION: Dynamic imports (\`await import()\`) are NOT supported in the VM execution context. Use only the pre-provided functions in the execution environment (createPlan, readPlan, updatePlan, addArtifact, completeTask, updateBlockContent, linkPR, addPRReviewComment, setupReviewNotification). All necessary APIs are already available in the sandbox.

## Available APIs

### createPlan(opts): Promise<{ planId, sessionToken, url, deliverables }>
Create a new plan and open it in browser.

Parameters:
- title (string, required): Plan title
- content (string, required): Markdown content. Use \`{#deliverable}\` on checkbox items.
- repo (string, optional): GitHub repo (org/repo). Auto-detected if not provided.
- prNumber (number, optional): PR number for artifact uploads.

Returns:
- planId: The plan ID
- sessionToken: Required for subsequent API calls
- url: Browser URL for the plan
- deliverables: Array of { id, text } for linking artifacts

Example:
\`\`\`typescript
const plan = await createPlan({
  title: "Add auth",
  content: "- [ ] Screenshot of login {#deliverable}"
});
// Returns: { planId: "abc", sessionToken: "xyz", url: "...", deliverables: [{ id: "del_xxx", text: "Screenshot of login" }] }
\`\`\`

---

### readPlan(planId, sessionToken, opts?): Promise<ReadPlanResult>
Read plan content, metadata, and deliverables.

Parameters:
- planId (string): The plan ID
- sessionToken (string): Session token from createPlan
- opts.includeAnnotations (boolean, optional): Include comment threads
- opts.includeLinkedPRs (boolean, optional): Include linked PRs section

Returns:
- content: Full markdown (with block IDs, annotations, and linked PRs if requested)
- status: Plan status (e.g., "draft", "pending_review", "changes_requested")
- title: Plan title
- repo: GitHub repo (if set)
- pr: PR number (if set)
- deliverables: Array of { id, text, completed }
- isError: Boolean

Example:
\`\`\`typescript
const data = await readPlan(planId, token, {
  includeAnnotations: true,
  includeLinkedPRs: true
});
if (data.status === "changes_requested") {
  // Respond to feedback
}
// Access deliverables directly
data.deliverables.forEach(d => console.log(d.id, d.completed));
\`\`\`

---

### updatePlan(planId, sessionToken, updates): Promise<void>
Update plan metadata.

Parameters:
- planId (string): The plan ID
- sessionToken (string): Session token
- updates.title (string, optional): New title
- updates.status (string, optional): 'draft' | 'pending_review' | 'changes_requested' | 'in_progress'

Note: Most status transitions are automatic. Rarely needed.

---

### addArtifact(opts): Promise<{ artifactId, url, allDeliverablesComplete, snapshotUrl? }>
Upload proof-of-work artifact.

Parameters:
- planId (string): The plan ID
- sessionToken (string): Session token
- type (string): 'screenshot' | 'video' | 'test_results' | 'diff'
- filename (string): e.g., "screenshot.png"
- source (string): Content source type - 'file' | 'url' | 'base64'
- filePath (string): Local file path (required when source='file') - RECOMMENDED
- contentUrl (string): URL to fetch from (required when source='url')
- content (string): Base64 encoded (required when source='base64', legacy)
- deliverableId (string, optional): Links artifact to deliverable
- description (string, optional): What this artifact proves

Auto-complete: When ALL deliverables have artifacts, returns snapshotUrl.

Example:
\`\`\`typescript
const result = await addArtifact({
  planId, sessionToken,
  type: 'screenshot',
  filename: 'login.png',
  source: 'file',
  filePath: '/tmp/screenshot.png',
  deliverableId: 'del_abc'
});
if (result.allDeliverablesComplete) {
  console.log('Done!', result.snapshotUrl);
}
\`\`\`

---

### completeTask(planId, sessionToken, summary?): Promise<{ snapshotUrl }>
Force-complete task. Usually NOT needed - addArtifact auto-completes.

---

### updateBlockContent(planId, sessionToken, operations): Promise<void>
Modify plan content blocks.

Operations array items:
- { type: 'update', blockId: string, content: string }
- { type: 'insert', afterBlockId: string | null, content: string }
- { type: 'delete', blockId: string }
- { type: 'replace_all', content: string }

---

### linkPR(opts): Promise<{ prNumber, url, status, branch, title }>
Link a GitHub PR to a plan.

Parameters:
- planId (string): The plan ID
- sessionToken (string): Session token
- prNumber (number): PR number to link
- branch (string, optional): Branch name (will be fetched if omitted)
- repo (string, optional): Repository override (org/repo). Uses plan repo if omitted.

Returns:
- prNumber: The PR number
- url: PR URL
- status: 'draft' | 'open' | 'merged' | 'closed'
- branch: Branch name
- title: PR title

Example:
\`\`\`typescript
const pr = await linkPR({
  planId, sessionToken,
  prNumber: 42
});
console.log('Linked:', pr.title, pr.status);
\`\`\`

---

### addPRReviewComment(opts): Promise<void>
Add review comment to PR diff.

Parameters:
- planId, sessionToken, prNumber, path, line, body

---

### setupReviewNotification(planId, pollIntervalSeconds?): Promise<{ script }>
Get a bash script to poll for plan approval status changes.

Parameters:
- planId (string): Plan ID to monitor
- pollIntervalSeconds (number, optional): Polling interval (default: 30)

Returns:
- script: Bash script that polls registry server and exits when status becomes 'changes_requested' or 'in_progress'

Use this for agents WITHOUT hook support (Cursor, Devin, etc). The script can be run in background.

Example:
\`\`\`typescript
const { script } = await setupReviewNotification(plan.planId, 15);
// Agent runs this script in background to wait for approval
console.log(script);
\`\`\`

---

### requestUserInput(opts): Promise<{ success, response?, status, reason? }>
Request input from the user via browser modal.

Parameters:
- message (string, required): The question to ask the user
- type (string, required): 'text' | 'choice' | 'confirm' | 'multiline'
- options (string[], optional): For 'choice' type - available options (required for choice)
- multiSelect (boolean, optional): For 'choice' type - allow selecting multiple options (uses checkboxes instead of radio buttons)
- defaultValue (string, optional): Pre-filled value for text/multiline inputs
- timeout (number, optional): Timeout in seconds (default: 300, min: 10, max: 600)
- planId (string, optional): Optional metadata to link request to plan (for activity log filtering)

Returns:
- success: Boolean indicating if user responded
- response: User's answer (if success=true)
- status: 'answered' | 'cancelled'
- reason: Reason for failure (if success=false): 'cancelled' | timeout message

The request appears as a modal in the browser. The function blocks until:
- User responds (success=true)
- User cancels (success=false)
- Timeout occurs (success=false)

Example:
\`\`\`typescript
const result = await requestUserInput({
  message: "Which database should we use?",
  type: "choice",
  options: ["PostgreSQL", "SQLite", "MongoDB"],
  timeout: 120  // 2 minutes
});

if (result.success) {
  console.log("User chose:", result.response);
} else {
  console.log("Request failed:", result.reason);
}
\`\`\`

---

### postActivityUpdate(opts): Promise<{ success, eventId, requestId? }>
Post an activity update to the agent activity feed.

Parameters:
- planId (string): The plan ID
- activityType (string): 'status' | 'note' | 'help_request' | 'milestone' | 'blocker'
- message (string): The activity message
- status (string, optional): For 'status' type: 'working' | 'blocked' | 'idle' | 'waiting'
- category (string, optional): For 'note' type: 'info' | 'progress' | 'decision' | 'question'

Returns:
- success: Boolean indicating if the update was logged
- eventId: The ID of the created event
- requestId: The request ID (only for 'help_request' and 'blocker' types)

Examples:
\`\`\`typescript
// Status update
await postActivityUpdate({
  planId: "abc",
  activityType: "status",
  status: "working",
  message: "Implementing authentication"
});

// Informational note
await postActivityUpdate({
  planId: "abc",
  activityType: "note",
  message: "Found a better approach using JWT",
  category: "decision"
});

// Request for help (non-blocking)
const result = await postActivityUpdate({
  planId: "abc",
  activityType: "help_request",
  message: "Should we use PostgreSQL or SQLite?"
});
// Save result.requestId to resolve later

// Milestone reached
await postActivityUpdate({
  planId: "abc",
  activityType: "milestone",
  message: "Authentication flow complete"
});

// Hit a blocker (needs resolution to proceed)
const blockerResult = await postActivityUpdate({
  planId: "abc",
  activityType: "blocker",
  message: "Missing API credentials"
});
// Save blockerResult.requestId to resolve later
\`\`\`

---

### resolveActivityRequest(opts): Promise<{ success }>
Resolve a previously posted help_request or blocker.

Parameters:
- planId (string): The plan ID
- requestId (string): The request ID from postActivityUpdate
- resolution (string, optional): How the request was resolved

Example:
\`\`\`typescript
// First, create a help request
const helpResult = await postActivityUpdate({
  planId: "abc",
  activityType: "help_request",
  message: "Which database should we use?"
});

// Later, resolve it
await resolveActivityRequest({
  planId: "abc",
  requestId: helpResult.requestId,
  resolution: "Using PostgreSQL based on team feedback"
});
\`\`\`

---

## Common Pattern

\`\`\`typescript
const plan = await createPlan({
  title: "Feature X",
  content: "- [ ] Screenshot {#deliverable}\\n- [ ] Video {#deliverable}"
});

// plan.deliverables = [{ id: "del_xxx", text: "Screenshot" }, { id: "del_yyy", text: "Video" }]

// Do work, take screenshots...

await addArtifact({
  planId: plan.planId,
  sessionToken: plan.sessionToken,
  type: 'screenshot',
  source: 'file',
  filename: 'screenshot.png',
  filePath: './screenshot.png',
  deliverableId: plan.deliverables[0].id  // Use actual deliverable ID
});

const result = await addArtifact({
  planId: plan.planId,
  sessionToken: plan.sessionToken,
  type: 'video',
  source: 'file',
  filename: 'demo.mp4',
  filePath: './demo.mp4',
  deliverableId: plan.deliverables[1].id  // Use actual deliverable ID
});

return { planId: plan.planId, snapshotUrl: result.snapshotUrl };
\`\`\`
`;
var ExecuteCodeInput = z12.object({
  code: z12.string().describe("TypeScript code to execute")
});
async function createPlan(opts) {
  const result = await createPlanTool.handler(opts);
  const text = result.content[0]?.text || "";
  const planId = text.match(/ID: (\S+)/)?.[1] || "";
  let deliverables = [];
  if (planId) {
    const ydoc = await getOrCreateDoc3(planId);
    const allDeliverables = getDeliverables(ydoc);
    deliverables = allDeliverables.map((d) => ({ id: d.id, text: d.text }));
  }
  return {
    planId,
    sessionToken: text.match(/Session Token: (\S+)/)?.[1] || "",
    url: text.match(/URL: (\S+)/)?.[1] || "",
    deliverables
  };
}
async function readPlan(planId, sessionToken, opts) {
  const result = await readPlanTool.handler({
    planId,
    sessionToken,
    includeAnnotations: opts?.includeAnnotations,
    includeLinkedPRs: opts?.includeLinkedPRs
  });
  const text = result.content[0]?.text || "";
  const ydoc = await getOrCreateDoc3(planId);
  const metadata = getPlanMetadata(ydoc);
  const deliverables = getDeliverables(ydoc).map((d) => ({
    id: d.id,
    text: d.text,
    completed: !!d.linkedArtifactId
  }));
  return {
    content: text,
    status: metadata?.status || "",
    title: metadata?.title || "",
    repo: metadata?.repo,
    pr: metadata?.pr,
    deliverables,
    isError: result.isError
  };
}
async function updatePlan(planId, sessionToken, updates) {
  await updatePlanTool.handler({ planId, sessionToken, ...updates });
}
async function addArtifact2(opts) {
  const result = await addArtifactTool.handler(opts);
  const text = result.content[0]?.text || "";
  if (result.isError) {
    return { isError: true, error: text };
  }
  const ydoc = await getOrCreateDoc3(opts.planId);
  const artifacts = getArtifacts(ydoc);
  const deliverables = getDeliverables(ydoc);
  const addedArtifact = artifacts.find((a) => a.filename === opts.filename);
  const allDeliverablesComplete = deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);
  const metadata = getPlanMetadata(ydoc);
  let artifactUrl = "";
  if (addedArtifact) {
    artifactUrl = addedArtifact.storage === "github" ? addedArtifact.url : `http://localhost:${process.env.REGISTRY_PORT || 3e3}/artifacts/${addedArtifact.localArtifactId}`;
  }
  return {
    artifactId: addedArtifact?.id || "",
    url: artifactUrl,
    allDeliverablesComplete,
    snapshotUrl: metadata?.status === "completed" ? metadata.snapshotUrl : void 0,
    isError: false
  };
}
async function completeTask(planId, sessionToken, summary) {
  const result = await completeTaskTool.handler({ planId, sessionToken, summary });
  const text = result.content[0]?.text || "";
  if (result.isError) {
    return { isError: true, error: text };
  }
  const ydoc = await getOrCreateDoc3(planId);
  const metadata = getPlanMetadata(ydoc);
  return {
    snapshotUrl: metadata?.status === "completed" ? metadata.snapshotUrl || "" : "",
    status: metadata?.status || "",
    isError: false
  };
}
async function updateBlockContent(planId, sessionToken, operations) {
  await updateBlockContentTool.handler({ planId, sessionToken, operations });
}
async function linkPR2(opts) {
  const result = await linkPRTool.handler(opts);
  const text = result.content[0]?.text || "";
  if (result.isError) {
    throw new Error(text);
  }
  const prNumber = opts.prNumber;
  const urlMatch = text.match(/URL: (https:\/\/[^\s]+)/);
  const statusMatch = text.match(/Status: (\w+)/);
  const branchMatch = text.match(/Branch: ([^\n]+)/);
  const titleMatch = text.match(/PR: #\d+ - ([^\n]+)/);
  return {
    prNumber,
    url: urlMatch?.[1] || "",
    status: statusMatch?.[1] || "",
    branch: branchMatch?.[1] || "",
    title: titleMatch?.[1] || ""
  };
}
async function addPRReviewComment2(opts) {
  await addPRReviewCommentTool.handler(opts);
}
async function setupReviewNotification(planId, pollIntervalSeconds) {
  const result = await setupReviewNotificationTool.handler({
    planId,
    pollIntervalSeconds: pollIntervalSeconds ?? 30
  });
  const text = result.content[0]?.text || "";
  const scriptMatch = text.match(/```bash\n([\s\S]*?)\n```/);
  const script = scriptMatch?.[1] || "";
  return { script, fullResponse: text };
}
async function requestUserInput(opts) {
  const { InputRequestManager: InputRequestManager2 } = await import("./input-request-manager-BZ54PS5V.js");
  const ydoc = await getOrCreateDoc3(PLAN_INDEX_DOC_NAME);
  const manager = new InputRequestManager2();
  const params = opts.type === "choice" ? {
    message: opts.message,
    type: "choice",
    options: opts.options ?? [],
    multiSelect: opts.multiSelect,
    defaultValue: opts.defaultValue,
    timeout: opts.timeout,
    planId: opts.planId
  } : {
    message: opts.message,
    type: opts.type,
    defaultValue: opts.defaultValue,
    timeout: opts.timeout,
    planId: opts.planId
  };
  const requestId = manager.createRequest(ydoc, params);
  const result = await manager.waitForResponse(ydoc, requestId, opts.timeout);
  if (result.status === "answered") {
    return {
      success: true,
      response: result.response,
      status: result.status,
      reason: void 0
    };
  }
  if (result.status === "declined") {
    return {
      success: false,
      response: void 0,
      status: result.status,
      reason: result.reason
    };
  }
  return {
    success: false,
    response: void 0,
    status: result.status,
    reason: result.reason
  };
}
async function postActivityUpdate(opts) {
  const { logPlanEvent: logPlanEvent2 } = await import("./dist-BSWHGGKS.js");
  const { getGitHubUsername: getGitHubUsername2 } = await import("./server-identity-KUXYHULN.js");
  const { nanoid: nanoid7 } = await import("nanoid");
  const doc = await getOrCreateDoc3(opts.planId);
  const actorName = await getGitHubUsername2();
  const requestId = nanoid7();
  const eventId = logPlanEvent2(
    doc,
    "agent_activity",
    actorName,
    {
      activityType: opts.activityType,
      requestId,
      message: opts.message
    },
    {
      inboxWorthy: true,
      inboxFor: "owner"
    }
  );
  return { success: true, eventId, requestId };
}
async function resolveActivityRequest(opts) {
  const { logPlanEvent: logPlanEvent2, getPlanEvents } = await import("./dist-BSWHGGKS.js");
  const { getGitHubUsername: getGitHubUsername2 } = await import("./server-identity-KUXYHULN.js");
  const doc = await getOrCreateDoc3(opts.planId);
  const actorName = await getGitHubUsername2();
  const events = getPlanEvents(doc);
  const originalEvent = events.find(
    (e) => e.type === "agent_activity" && e.data && "requestId" in e.data && e.data.requestId === opts.requestId && (e.data.activityType === "help_request" || e.data.activityType === "blocker")
  );
  if (!originalEvent || originalEvent.type !== "agent_activity") {
    throw new Error(`Unresolved request ${opts.requestId} not found`);
  }
  const existingResolution = events.find(
    (e) => e.type === "agent_activity" && e.data && "requestId" in e.data && e.data.requestId === opts.requestId && (e.data.activityType === "help_request_resolved" || e.data.activityType === "blocker_resolved")
  );
  if (existingResolution) {
    throw new Error(`Request ${opts.requestId} has already been resolved`);
  }
  const activityType = originalEvent.data.activityType;
  const resolvedType = activityType === "help_request" ? "help_request_resolved" : "blocker_resolved";
  logPlanEvent2(doc, "agent_activity", actorName, {
    activityType: resolvedType,
    requestId: opts.requestId,
    resolution: opts.resolution
  });
  return { success: true };
}
var executeCodeTool = {
  definition: {
    name: TOOL_NAMES.EXECUTE_CODE,
    description: BUNDLED_DOCS,
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "TypeScript code to execute with access to all Shipyard APIs"
        }
      },
      required: ["code"]
    }
  },
  handler: async (args) => {
    const { code } = ExecuteCodeInput.parse(args);
    logger.info({ codeLength: code.length }, "Executing code");
    try {
      const sandbox = {
        createPlan,
        readPlan,
        updatePlan,
        addArtifact: addArtifact2,
        completeTask,
        updateBlockContent,
        linkPR: linkPR2,
        addPRReviewComment: addPRReviewComment2,
        setupReviewNotification,
        requestUserInput,
        postActivityUpdate,
        resolveActivityRequest,
        console: {
          log: (...logArgs) => logger.info({ output: logArgs }, "console.log"),
          error: (...logArgs) => logger.error({ output: logArgs }, "console.error")
        }
      };
      const wrappedCode = `(async () => { ${code} })()`;
      const context = vm.createContext(sandbox);
      const script = new vm.Script(wrappedCode);
      const result = await script.runInContext(context, { timeout: 12e4 });
      logger.info({ result }, "Code execution complete");
      return {
        content: [
          {
            type: "text",
            text: typeof result === "object" ? JSON.stringify(result, null, 2) : String(result ?? "Done")
          }
        ]
      };
    } catch (error) {
      logger.error({ error, code }, "Code execution failed");
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Execution error: ${message}` }],
        isError: true
      };
    }
  }
};

// src/tools/request-user-input.ts
import { z as z13 } from "zod";
var RequestUserInputInput = z13.object({
  message: z13.string().describe("The question to ask the user"),
  type: z13.enum(["text", "choice", "confirm", "multiline"]).describe("Type of input to request"),
  options: z13.array(z13.string()).optional().describe("For 'choice' type - available options (required for choice)"),
  multiSelect: z13.boolean().optional().describe("For 'choice' type - allow selecting multiple options"),
  defaultValue: z13.string().optional().describe("Pre-filled value for text/multiline inputs"),
  timeout: z13.number().optional().describe("Timeout in seconds (default: 300, min: 10, max: 600)"),
  planId: z13.string().optional().describe("Optional metadata to link request to plan (for activity log filtering)")
});
var requestUserInputTool = {
  definition: {
    name: TOOL_NAMES.REQUEST_USER_INPUT,
    description: `Request input from the user via browser modal.

IMPORTANT: Use this instead of your platform's built-in question/input tools (like AskUserQuestion).
This provides a consistent browser UI experience and integrates with the shipyard workflow.

The request appears as a modal in the browser UI. The function blocks until:
- User responds (success=true, status='answered')
- User declines (success=true, status='declined')
- Timeout occurs (success=false, status='cancelled')

Input types:
- text: Single-line text input
- multiline: Multi-line text area
- choice: Select from options (requires 'options' parameter)
- confirm: Yes/No confirmation

For 'choice' type:
- Set multiSelect=true to allow multiple selections (checkboxes)
- Set multiSelect=false or omit for single selection (radio buttons)

This tool is analogous to AskUserQuestion, prompt(), or other agent question mechanisms,
but shows responses in the browser UI where users are already viewing plans.

NOTE: This is also available as requestUserInput() inside execute_code for multi-step workflows.`,
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The question to ask the user"
        },
        type: {
          type: "string",
          enum: ["text", "choice", "confirm", "multiline"],
          description: "Type of input to request"
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "For 'choice' type - available options (required for choice)"
        },
        multiSelect: {
          type: "boolean",
          description: "For 'choice' type - allow selecting multiple options"
        },
        defaultValue: {
          type: "string",
          description: "Pre-filled value for text/multiline inputs"
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 300, min: 10, max: 600)"
        },
        planId: {
          type: "string",
          description: "Optional metadata to link request to plan (for activity log filtering)"
        }
      },
      required: ["message", "type"]
    }
  },
  handler: async (args) => {
    const input = RequestUserInputInput.parse(args);
    logger.info(
      { type: input.type, timeout: input.timeout, planId: input.planId },
      "Processing request_user_input"
    );
    if (input.type === "choice" && (!input.options || input.options.length === 0)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              status: "cancelled",
              reason: "'choice' type requires 'options' array with at least one option"
            })
          }
        ],
        isError: true
      };
    }
    try {
      const ydoc = await getOrCreateDoc3(PLAN_INDEX_DOC_NAME);
      const manager = new InputRequestManager();
      const params = input.type === "choice" ? {
        message: input.message,
        type: "choice",
        options: input.options ?? [],
        multiSelect: input.multiSelect,
        defaultValue: input.defaultValue,
        timeout: input.timeout,
        planId: input.planId
      } : {
        message: input.message,
        type: input.type,
        defaultValue: input.defaultValue,
        timeout: input.timeout,
        planId: input.planId
      };
      const requestId = manager.createRequest(ydoc, params);
      const result = await manager.waitForResponse(ydoc, requestId, input.timeout);
      if (result.status === "answered") {
        logger.info({ requestId, answeredBy: result.answeredBy }, "User input received");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                response: result.response,
                status: result.status
              })
            }
          ]
        };
      }
      if (result.status === "declined") {
        logger.info({ requestId }, "User declined input request");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                status: result.status,
                reason: result.reason
              })
            }
          ]
        };
      }
      logger.info({ requestId, reason: result.reason }, "Input request cancelled");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              status: result.status,
              reason: result.reason
            })
          }
        ]
      };
    } catch (error) {
      logger.error({ error }, "Error in request_user_input");
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              status: "cancelled",
              reason: message
            })
          }
        ],
        isError: true
      };
    }
  }
};

// src/index.ts
var registryPort = await isRegistryRunning();
if (!registryPort) {
  const acquired = await tryAcquireHubLock();
  if (acquired) {
    logger.info("Acquired hub lock, starting registry hub");
    const hubPort2 = await startRegistryServer();
    if (!hubPort2) {
      await releaseHubLock();
      logger.error("Failed to start registry hub - all ports in use");
      process.exit(1);
    }
    initAsHub();
    logger.info({ hubPort: hubPort2 }, "Registry hub started successfully");
  } else {
    logger.info("Hub lock held by another process, waiting to become client");
    await new Promise((resolve3) => setTimeout(resolve3, 2e3));
    const port = await isRegistryRunning();
    if (port) {
      logger.info({ registryPort: port }, "Connecting to registry hub as client");
      await initAsClient(port);
    } else {
      logger.error("Failed to find running hub after lock acquisition failed");
      process.exit(1);
    }
  }
} else {
  logger.info({ registryPort }, "Connecting to registry hub as client");
  await initAsClient(registryPort);
}
var server = new Server(
  {
    name: "shipyard",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [executeCodeTool.definition, requestUserInputTool.definition]
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === TOOL_NAMES.EXECUTE_CODE) {
    return await executeCodeTool.handler(args ?? {});
  }
  if (name === TOOL_NAMES.REQUEST_USER_INPUT) {
    return await requestUserInputTool.handler(args ?? {});
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});
var transport = new StdioServerTransport();
await server.connect(transport);
logger.info("MCP server started");
