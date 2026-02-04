/**
 * execute_code VM sandbox.
 *
 * Creates isolated execution context for user code with access to Shipyard APIs.
 * Ported from apps/server-legacy/src/tools/execute-code.ts sandbox logic.
 */

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import * as apiWrappers from './api-wrappers.js';
import { requestUserInput } from './input-request.js';

/**
 * Sandbox context with Shipyard API wrappers.
 */
export interface SandboxContext extends vm.Context {
  createTask: typeof apiWrappers.createTask;
  readTask: typeof apiWrappers.readTask;
  updateTask: typeof apiWrappers.updateTask;
  addArtifact: typeof apiWrappers.addArtifact;
  completeTask: typeof apiWrappers.completeTask;
  updateBlockContent: typeof apiWrappers.updateBlockContent;
  linkPR: typeof apiWrappers.linkPR;
  postUpdate: typeof apiWrappers.postUpdate;
  readDiffComments: typeof apiWrappers.readDiffComments;
  replyToDiffComment: typeof apiWrappers.replyToDiffComment;
  replyToThreadComment: typeof apiWrappers.replyToThreadComment;
  regenerateSessionToken: typeof apiWrappers.regenerateSessionToken;
  requestUserInput: typeof requestUserInput;
  encodeVideo: (opts: { framesDir: string; fps?: number; outputPath?: string }) => Promise<string>;
  console: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  child_process: typeof child_process;
  fs: typeof fs;
  path: typeof path;
  os: typeof os;
}

/**
 * Encode video from frames directory using ffmpeg.
 * Returns the path to the encoded video.
 */
async function encodeVideo(opts: {
  framesDir: string;
  fps?: number;
  outputPath?: string;
}): Promise<string> {
  const fps = opts.fps || 6;
  const outputPath = opts.outputPath || path.join(os.tmpdir(), `video-${Date.now()}.mp4`);

  const ffmpegPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'];

  let ffmpegPath = 'ffmpeg';
  for (const p of ffmpegPaths) {
    if (fs.existsSync(p)) {
      ffmpegPath = p;
      break;
    }
  }

  const { spawnSync } = child_process;
  const result = spawnSync(
    ffmpegPath,
    [
      '-y',
      '-framerate',
      String(fps),
      '-i',
      path.join(opts.framesDir, 'frame-%06d.jpg'),
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'fast',
      outputPath,
    ],
    { encoding: 'utf-8', timeout: 60000 }
  );

  if (result.status !== 0) {
    throw new Error(`FFmpeg encoding failed: ${result.stderr?.slice(-300) || 'unknown error'}`);
  }

  fs.rmSync(opts.framesDir, { recursive: true, force: true });

  return outputPath;
}

/**
 * Create a sandbox context with all Shipyard APIs available.
 */
export function createSandboxContext(): SandboxContext {
  const sandbox = {
    createTask: apiWrappers.createTask,
    readTask: apiWrappers.readTask,
    updateTask: apiWrappers.updateTask,
    addArtifact: apiWrappers.addArtifact,
    completeTask: apiWrappers.completeTask,
    updateBlockContent: apiWrappers.updateBlockContent,
    linkPR: apiWrappers.linkPR,
    postUpdate: apiWrappers.postUpdate,
    readDiffComments: apiWrappers.readDiffComments,
    replyToDiffComment: apiWrappers.replyToDiffComment,
    replyToThreadComment: apiWrappers.replyToThreadComment,
    regenerateSessionToken: apiWrappers.regenerateSessionToken,
    requestUserInput,

    encodeVideo,

    child_process,
    fs,
    path,
    os,

    console: {
      log: (...logArgs: unknown[]) => logger.info({ output: logArgs }, 'console.log'),
      error: (...logArgs: unknown[]) => logger.error({ output: logArgs }, 'console.error'),
    },
  };

  // eslint-disable-next-line no-restricted-syntax
  return vm.createContext(sandbox) as SandboxContext;
}

/**
 * Execute code in the sandbox context.
 */
export async function executeInSandbox(code: string, context: SandboxContext): Promise<unknown> {
  /** Wrap code in async IIFE for top-level await support */
  const wrappedCode = `(async () => { ${code} })()`;

  const script = new vm.Script(wrappedCode);

  /** Execute with 2 minute timeout */
  return script.runInContext(context, { timeout: 120000 });
}

/**
 * Serialize an error for logging and user display.
 * Handles: Error, ZodError, plain objects, and error.cause chain.
 * Returns { details, message, stack } for structured logging.
 */
export async function serializeError(error: unknown): Promise<{
  details: Record<string, unknown>;
  message: string;
  stack?: string;
}> {
  if (error instanceof z.ZodError) {
    const formattedIssues = error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    const message = `Validation error:\n${formattedIssues}`;
    return {
      details: {
        name: 'ZodError',
        message,
        issues: error.issues,
        stack: error.stack,
      },
      message,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      details: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause instanceof Error ? error.cause.message : error.cause,
      },
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === 'object') {
    /** Use 'in' check to safely access message property without type assertion */
    const message =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : JSON.stringify(error).slice(0, 500) || 'Unknown error';
    return {
      details: { raw: JSON.stringify(error).slice(0, 1000) },
      message,
    };
  }

  const message = String(error) || 'Unknown error';
  return { details: { raw: message }, message };
}
