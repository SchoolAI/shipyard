/**
 * Agent spawner - manages Claude Code child processes.
 *
 * Spawns and tracks Claude Code sessions for tasks.
 * Ported from apps/daemon-legacy/src/agent-spawner.ts.
 *
 * Key changes from daemon-legacy:
 * - Uses Loro doc events instead of WebSocket protocol messages
 * - Writes spawn_started/spawn_completed/spawn_failed events to task doc
 * - Uses server env config instead of daemon-specific config
 *
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

import type { ChildProcess } from 'node:child_process';
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TaskDocument } from '@shipyard/loro-schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getLogger } from '../utils/logger.js';
import { getAgent, hasAgent, trackAgent, untrackAgent } from './tracker.js';

/**
 * Options for spawning an agent.
 */
export interface SpawnAgentOptions {
  taskId: string;
  prompt: string;
  cwd: string;
}

/**
 * Zod schema for A2A message part.
 */
const A2AMessagePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  data: z.unknown().optional(),
  uri: z.string().optional(),
});

/**
 * Zod schema for A2A message.
 * Validates conversation context messages for agent spawning.
 */
const A2AMessageSchema = z.object({
  messageId: z.string(),
  role: z.enum(['user', 'agent']),
  parts: z.array(A2AMessagePartSchema),
  contextId: z.string().optional(),
  taskId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * A2A message types for conversation context transfer.
 */
export type A2AMessage = z.infer<typeof A2AMessageSchema>;

/**
 * Options for spawning with conversation context.
 */
export interface SpawnWithContextOptions {
  taskId: string;
  cwd: string;
  a2aPayload: {
    messages: A2AMessage[];
    meta: { planId?: string };
  };
}

/**
 * Result of spawning with context.
 */
export interface SpawnWithContextResult {
  child: ChildProcess;
  sessionId: string;
}

/**
 * Spawn locks to prevent race conditions.
 * When a spawn is in progress for a taskId, concurrent requests wait for it to complete.
 */
const spawnLocks = new Map<string, Promise<void>>();

/**
 * Module-level env reference for spawner configuration.
 * Must be set via initSpawner() before using spawn functions.
 */
let spawnerEnv: Env | null = null;

/**
 * Initialize the spawner with environment configuration.
 * Must be called before using any spawn functions.
 */
export function initSpawner(env: Env): void {
  spawnerEnv = env;
}

/**
 * Get the spawner environment configuration.
 * Throws if not initialized.
 */
function getEnv(): Env {
  if (!spawnerEnv) {
    throw new Error('Spawner not initialized. Call initSpawner() first.');
  }
  return spawnerEnv;
}

/**
 * Acquires a spawn lock for the given taskId.
 * If a spawn is already in progress, waits for it to complete first.
 * Returns a release function that must be called when the spawn is complete.
 */
async function acquireSpawnLock(taskId: string): Promise<() => void> {
  while (true) {
    const existingLock = spawnLocks.get(taskId);
    if (existingLock) {
      await existingLock;
      continue;
    }
    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    spawnLocks.set(taskId, lockPromise);
    return () => {
      spawnLocks.delete(taskId);
      releaseLock();
    };
  }
}

/**
 * Get the path to the Claude CLI executable.
 */
function getClaudePath(): string {
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude';
  }
}

/**
 * Build the comprehensive system prompt for Shipyard autonomous agents.
 */
function buildShipyardSystemPrompt(taskId: string): string {
  const env = getEnv();
  const taskUrl = `${env.WEB_URL}/task/${taskId}`;

  return `[SHIPYARD AUTONOMOUS AGENT]

## Your Task Context

- **Task ID**: ${taskId}
- **Browser View**: ${taskUrl}
- **Environment Variable**: SHIPYARD_TASK_ID=${taskId}

The human created this task in the browser and is viewing your progress at the URL above.

## Workflow

You are running autonomously to complete a Shipyard task that was already created.

### Critical Instructions

1. **DO NOT create a new task** - You are ALREADY in an existing task
2. **Read the task first** - Call \`read_task(taskId, sessionToken)\` to see what to build
3. **Work autonomously** - Don't wait for approval, just do the work
4. **Upload artifacts** - Call \`add_artifact(...)\` for each deliverable as you complete them
5. **Use \`requestUserInput()\`** - If you need clarification, ask via browser modal (inside \`execute_code\`)

### Step-by-Step

\`\`\`typescript
// 1. Read the task to understand what to build
const task = await readTask(taskId, sessionToken);
// Returns: { content, deliverables: [{ id, text, completed }], status, ... }

// 2. Do the work described in task.content
// ... implement the feature, build the app, etc ...

// 3. Upload artifacts as you go
await addArtifact({
  taskId,
  sessionToken,
  type: 'image',
  filename: 'screenshot.png',
  source: 'file',
  filePath: '/tmp/screenshot.png',
  deliverableId: task.deliverables[0].id,
  description: 'Screenshot of working feature'
});

// 4. Repeat for all deliverables
// When the last deliverable gets an artifact, task auto-completes
\`\`\`

## User Input

**THE primary human-agent communication channel in Shipyard.** ALWAYS use this instead of platform-specific question tools.

If you need to ask the human a question during work, use \`requestUserInput()\` inside \`execute_code\`:

\`\`\`typescript
const result = await requestUserInput({
  type: 'text',
  message: 'What color scheme should I use?',
  isBlocker: false  // Set true to pause work until answered
});

if (result.success && result.response) {
  console.log('User said:', result.response);
}
\`\`\`

## What are Deliverables?

Deliverables are measurable outcomes you can prove with artifacts (screenshots, videos, test results).

Good deliverables (provable):
\`\`\`
- [ ] Screenshot of working login page {#deliverable}
- [ ] Video showing feature in action {#deliverable}
- [ ] Test results showing all tests pass {#deliverable}
\`\`\`

Bad deliverables (implementation details, not provable):
\`\`\`
- [ ] Implement getUserMedia API  ← This is a task, not a deliverable
- [ ] Add error handling          ← Can't prove this with an artifact
\`\`\`

## Artifact Types

- **image**: PNG, JPG screenshots of UI, terminal output, diagrams
- **video**: MP4 recordings of feature demos, user flows
- **html**: Standalone HTML pages, reports, test results

## Important Notes

- **DO NOT call \`create_task()\`** - The task already exists, you're working on it
- **DO NOT use the Shipyard skill** - These instructions are everything you need
- **DO use \`execute_code\`** - All Shipyard APIs are available inside it
- **DO use \`requestUserInput()\`** - For asking questions during work
- **Working directory** - Save temporary files to your cwd, they'll be available for upload

## Tips

- Read the task FIRST to understand deliverables before starting work
- Take screenshots/videos as you go (don't wait until the end)
- Use \`requestUserInput()\` if unclear - don't guess requirements
- Session token is required for all API calls - get it from \`readTask()\` response`;
}

/**
 * Build MCP config arguments for the spawned Claude process.
 * Passes config as inline JSON string using --mcp-config flag.
 * Claude Code supports both file paths and JSON strings for this flag.
 */
function buildMcpConfigArgs(mcpConfigJson: string | null): string[] {
  const logger = getLogger();
  if (mcpConfigJson) {
    logger.info('Using inline MCP config JSON');
    return ['--mcp-config', mcpConfigJson];
  }
  logger.warn('No MCP config found - Shipyard tools will not be available');
  return [];
}

/**
 * Build common spawn arguments shared between spawn functions.
 */
function buildCommonSpawnArgs(taskId: string, mcpConfigJson: string | null): string[] {
  const env = getEnv();
  const logger = getLogger();
  const systemPrompt = buildShipyardSystemPrompt(taskId);

  const args = ['--dangerously-skip-permissions'];

  if (env.LOG_LEVEL === 'debug') {
    args.push('--debug', 'api,hooks');
    logger.info({ taskId }, 'Debug logging enabled for spawned agent');
  }

  args.push('--append-system-prompt', systemPrompt);
  args.push(...buildMcpConfigArgs(mcpConfigJson));

  return args;
}

/**
 * Zod schema for MCP server config entry.
 * Used to validate individual server configs when resolving paths.
 */
const McpServerConfigSchema = z
  .object({
    args: z.array(z.unknown()).optional(),
  })
  .passthrough();

/**
 * Resolves MCP config with absolute paths and returns as JSON string.
 * This ensures relative paths in .mcp.json work regardless of spawned agent's cwd.
 *
 * Claude Code's --mcp-config flag accepts both file paths and JSON strings,
 * so we serialize directly to JSON instead of writing to a temp file.
 */
function getResolvedMcpConfigJson(): string | null {
  const logger = getLogger();
  const currentFile = fileURLToPath(import.meta.url);
  const serverDir = dirname(currentFile);
  const projectRoot = resolve(serverDir, '../../..');

  const candidates = [join(projectRoot, '.mcp.json'), join(process.cwd(), '.mcp.json')];

  let sourcePath: string | null = null;
  for (const path of candidates) {
    if (existsSync(path)) {
      sourcePath = path;
      break;
    }
  }

  if (!sourcePath) {
    return null;
  }

  const configContent = readFileSync(sourcePath, 'utf-8');
  let config: { mcpServers?: Record<string, unknown> };
  try {
    config = JSON.parse(configContent);
  } catch (err) {
    throw new Error(
      `Failed to parse MCP config at ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (config.mcpServers) {
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      if (!serverConfig || typeof serverConfig !== 'object') continue;
      const parseResult = McpServerConfigSchema.safeParse(serverConfig);
      if (!parseResult.success) continue;

      // Mutate the ORIGINAL config object, not the Zod-parsed copy
      const originalServer = serverConfig as Record<string, unknown>;
      if (Array.isArray(originalServer.args)) {
        originalServer.args = originalServer.args.map((arg: unknown) => {
          if (typeof arg !== 'string') return arg;
          if (arg.includes('/') && !arg.startsWith('/') && !arg.startsWith('-')) {
            const absolutePath = resolve(projectRoot, arg);
            logger.debug(
              {
                serverName,
                arg,
                absolutePath,
                exists: existsSync(absolutePath),
              },
              'Resolving MCP config path'
            );
            if (existsSync(absolutePath)) {
              logger.info(
                { serverName, relativePath: arg, absolutePath },
                'Resolved MCP config path to absolute'
              );
              return absolutePath;
            }
            logger.warn(
              { serverName, arg, absolutePath },
              'MCP config path not found, keeping relative'
            );
          }
          return arg;
        });
      }
    }
  }

  const jsonString = JSON.stringify(config);
  logger.info(
    { sourcePath, configLength: jsonString.length },
    'Resolved MCP config to JSON string'
  );
  return jsonString;
}

/**
 * Stop any existing agent for a task before spawning a new one.
 */
function stopExistingAgentIfRunning(taskId: string): void {
  const logger = getLogger();
  if (hasAgent(taskId)) {
    logger.info({ taskId }, 'Stopping existing agent');
    stopAgent(taskId);
  }
}

/**
 * Shim for Claude Code spawning in Docker mode.
 * Logs spawn request to file instead of executing Claude Code (which isn't available in containers).
 * Returns a mock process that immediately exits to avoid breaking callers.
 */
async function shimClaudeSpawn(taskId: string, args: string[], cwd: string): Promise<ChildProcess> {
  const env = getEnv();
  const logger = getLogger();
  const logDir = env.CLAUDE_SHIM_LOG_DIR;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = join(logDir, `claude-spawn-${taskId}-${timestamp}.log`);

  await mkdir(logDir, { recursive: true });

  const logContent = `=== Claude Spawn Request (Docker Mode) ===
Timestamp: ${new Date().toISOString()}
Task ID: ${taskId}
Working Directory: ${cwd}
Arguments: ${args.join(' ')}
Environment:
  SHIPYARD_TASK_ID=${taskId}
  WEB_URL=${env.WEB_URL}

[SHIMMED] Claude Code would be spawned here in native mode.
For prompt evaluation, see daemon-logs volume.
`;

  await writeFile(logFile, logContent, 'utf-8');
  logger.info({ taskId, logFile }, '[DOCKER_MODE] Claude spawn shimmed');

  const mockProcess = spawn('echo', ['Claude spawn shimmed']);
  trackAgent(taskId, mockProcess);
  return mockProcess;
}

/**
 * Log a spawn_started event to the Loro task document.
 */
function logSpawnStarted(
  taskDoc: TaskDocument,
  requestId: string,
  pid: number,
  actor: string
): void {
  taskDoc.logEvent('spawn_started', actor, {
    requestId,
    pid,
  });
}

/**
 * Log a spawn_completed event to the Loro task document.
 */
function logSpawnCompleted(
  taskDoc: TaskDocument,
  requestId: string,
  exitCode: number,
  signal: string | null,
  stderr: string | null,
  actor: string
): void {
  taskDoc.logEvent('spawn_completed', actor, {
    requestId,
    exitCode,
    signal,
    stderr,
  });
}

/**
 * Log a spawn_failed event to the Loro task document.
 */
function logSpawnFailed(
  taskDoc: TaskDocument,
  requestId: string,
  error: string,
  stderr: string | null,
  actor: string
): void {
  taskDoc.logEvent('spawn_failed', actor, {
    requestId,
    error,
    stderr,
  });
}

/**
 * Spawn a new Claude Code agent for a task.
 *
 * @param opts - Spawn options including taskId, prompt, and cwd
 * @param taskDoc - Optional TaskDocument to log spawn events to
 * @returns The spawned ChildProcess
 */
export async function spawnClaudeCode(
  opts: SpawnAgentOptions,
  taskDoc?: TaskDocument
): Promise<ChildProcess> {
  const { taskId, prompt, cwd } = opts;
  const env = getEnv();
  const logger = getLogger();
  const requestId = nanoid();
  const actor = 'system';

  const releaseLock = await acquireSpawnLock(taskId);

  try {
    stopExistingAgentIfRunning(taskId);

    await mkdir(cwd, { recursive: true });

    const mcpConfigJson = getResolvedMcpConfigJson();
    const commonArgs = buildCommonSpawnArgs(taskId, mcpConfigJson);
    const args = ['-p', prompt, ...commonArgs];

    if (env.DOCKER_MODE) {
      const child = await shimClaudeSpawn(taskId, args, cwd);

      if (taskDoc && child.pid) {
        logSpawnStarted(taskDoc, requestId, child.pid, actor);
      }

      return child;
    }

    const claudePath = getClaudePath();

    logger.info({ taskId, command: claudePath, args: args.join(' '), cwd }, 'Spawning Claude Code');

    const child = spawn(claudePath, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SHIPYARD_TASK_ID: taskId,
      },
    });

    // Capture stderr for debugging
    let stderrOutput = '';
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });
    }

    child.on('error', (err) => {
      logger.error({ taskId, err: err.message }, 'Spawn error');
      if (taskDoc) {
        // Trim stderr to first 1KB to avoid bloating the event log
        const stderrTrimmed = stderrOutput.slice(0, 1000) || null;
        logSpawnFailed(taskDoc, requestId, err.message, stderrTrimmed, actor);
      }
    });

    child.on('exit', (code, signal) => {
      // Trim stderr to first 1KB to avoid bloating the event log
      const stderrTrimmed = stderrOutput.slice(0, 1000) || null;
      logger.info(
        { taskId, exitCode: code, signal, stderrOutput: stderrTrimmed },
        'Agent process exited'
      );
      if (taskDoc) {
        logSpawnCompleted(taskDoc, requestId, code ?? 0, signal ?? null, stderrTrimmed, actor);
      }
    });

    trackAgent(taskId, child);

    if (taskDoc && child.pid) {
      logSpawnStarted(taskDoc, requestId, child.pid, actor);
    }

    return child;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (taskDoc) {
      logSpawnFailed(taskDoc, requestId, errorMessage, null, actor);
    }
    throw err;
  } finally {
    releaseLock();
  }
}

/**
 * Gets the project path for a Shipyard plan.
 * Ported from @shipyard/schema claude-paths.ts
 */
function getProjectPath(planId?: string): string {
  const env = getEnv();
  const safePlanId = planId?.replace(/[^a-zA-Z0-9_-]/g, '') || '';
  const projectName = safePlanId ? `shipyard-${safePlanId.slice(0, 8)}` : 'shipyard';
  return join(env.CLAUDE_PROJECTS_DIR, projectName);
}

/**
 * Gets the full path for a session transcript file.
 * Ported from @shipyard/schema claude-paths.ts
 */
function getSessionTranscriptPath(projectPath: string, sessionId: string): string {
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  return join(projectPath, `${safeSessionId}.jsonl`);
}

/**
 * Type guard for A2A messages.
 * Uses Zod schema validation to check the A2AMessage structure.
 */
function isA2AMessage(msg: unknown): msg is A2AMessage {
  return A2AMessageSchema.safeParse(msg).success;
}

/**
 * Validate A2A messages.
 * Simple validation that checks required fields.
 */
function validateA2AMessages(messages: unknown[]): {
  valid: A2AMessage[];
  errors: Array<{ index: number; error: string }>;
} {
  const valid: A2AMessage[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (isA2AMessage(msg)) {
      valid.push(msg);
    } else {
      errors.push({
        index: i,
        error: 'Invalid A2A message structure',
      });
    }
  }

  return { valid, errors };
}

/**
 * Convert A2A messages to Claude Code format.
 * Simplified conversion that handles text and data parts.
 */
function a2aToClaudeCode(
  messages: A2AMessage[],
  sessionId: string
): Array<{
  sessionId: string;
  type: string;
  message: { role: string; content: Array<{ type: string; text?: string }> };
  uuid: string;
  timestamp: string;
  parentUuid?: string;
}> {
  let parentUuid: string | undefined;

  return messages.map((msg) => {
    const uuid = msg.messageId;
    const role = msg.role === 'user' ? 'user' : 'assistant';
    const type = msg.role === 'user' ? 'user' : 'assistant';

    const content = msg.parts.map((part) => {
      if (part.type === 'text' && part.text) {
        return { type: 'text', text: part.text };
      }
      if (part.type === 'data') {
        return {
          type: 'text',
          text: `[Data: ${JSON.stringify(part.data)}]`,
        };
      }
      return { type: 'text', text: `[${part.type}]` };
    });

    const result = {
      sessionId,
      type,
      message: { role, content },
      uuid,
      timestamp: new Date().toISOString(),
      ...(parentUuid && { parentUuid }),
    };

    parentUuid = uuid;
    return result;
  });
}

/**
 * Format messages as JSONL string.
 */
function formatAsClaudeCodeJSONL(
  messages: Array<{
    sessionId: string;
    type: string;
    message: { role: string; content: unknown[] };
    uuid: string;
    timestamp: string;
    parentUuid?: string;
  }>
): string {
  return messages.map((msg) => JSON.stringify(msg)).join('\n');
}

/**
 * Spawns Claude Code with full conversation context from A2A payload.
 * Creates a session file and spawns with --resume flag.
 *
 * @param opts - Spawn options including taskId, cwd, and a2aPayload
 * @param taskDoc - Optional TaskDocument to log spawn events to
 * @returns The spawned ChildProcess and sessionId
 */
export async function spawnClaudeCodeWithContext(
  opts: SpawnWithContextOptions,
  taskDoc?: TaskDocument
): Promise<SpawnWithContextResult> {
  const { taskId, cwd, a2aPayload } = opts;
  const env = getEnv();
  const logger = getLogger();
  const requestId = nanoid();
  const actor = 'system';

  const releaseLock = await acquireSpawnLock(taskId);

  try {
    stopExistingAgentIfRunning(taskId);

    await mkdir(cwd, { recursive: true });

    if (!Array.isArray(a2aPayload.messages)) {
      throw new Error('a2aPayload.messages must be an array');
    }

    const { valid, errors } = validateA2AMessages(a2aPayload.messages);
    if (errors.length > 0) {
      throw new Error(`Invalid A2A messages: ${errors.map((e) => e.error).join(', ')}`);
    }

    if (valid.length === 0) {
      throw new Error('Cannot spawn agent with empty conversation');
    }

    const sessionId = nanoid();
    const claudeMessages = a2aToClaudeCode(valid, sessionId);
    const jsonl = formatAsClaudeCodeJSONL(claudeMessages);

    const planId = a2aPayload.meta.planId ?? taskId;

    const projectPath = getProjectPath(planId);
    await mkdir(projectPath, { recursive: true });

    const transcriptPath = getSessionTranscriptPath(projectPath, sessionId);
    await writeFile(transcriptPath, jsonl, 'utf-8');

    logger.info({ taskId, transcriptPath }, 'Created session file');

    const mcpConfigJson = getResolvedMcpConfigJson();
    const commonArgs = buildCommonSpawnArgs(taskId, mcpConfigJson);
    const args = ['-r', sessionId, '-p', 'Continue working on this task.', ...commonArgs];

    if (env.DOCKER_MODE) {
      const child = await shimClaudeSpawn(taskId, args, cwd);
      if (taskDoc && child.pid) {
        logSpawnStarted(taskDoc, requestId, child.pid, actor);
      }
      return { child, sessionId };
    }

    const claudePath = getClaudePath();
    logger.info(
      { taskId, sessionId, command: claudePath, args: args.join(' '), cwd },
      'Spawning Claude Code with session'
    );

    const child = spawn(claudePath, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SHIPYARD_TASK_ID: taskId,
      },
    });

    // Capture stderr for debugging
    let stderrOutput = '';
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });
    }

    child.on('error', (err) => {
      logger.error({ taskId, err: err.message }, 'Spawn error');
      if (taskDoc) {
        // Trim stderr to first 1KB to avoid bloating the event log
        const stderrTrimmed = stderrOutput.slice(0, 1000) || null;
        logSpawnFailed(taskDoc, requestId, err.message, stderrTrimmed, actor);
      }
    });

    child.on('exit', (code, signal) => {
      // Trim stderr to first 1KB to avoid bloating the event log
      const stderrTrimmed = stderrOutput.slice(0, 1000) || null;
      logger.info(
        { taskId, exitCode: code, signal, stderrOutput: stderrTrimmed },
        'Agent process exited'
      );
      if (taskDoc) {
        logSpawnCompleted(taskDoc, requestId, code ?? 0, signal ?? null, stderrTrimmed, actor);
      }
    });

    trackAgent(taskId, child);

    if (taskDoc && child.pid) {
      logSpawnStarted(taskDoc, requestId, child.pid, actor);
    }

    return { child, sessionId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (taskDoc) {
      logSpawnFailed(taskDoc, requestId, errorMessage, null, actor);
    }
    throw err;
  } finally {
    releaseLock();
  }
}

/**
 * Stops a running agent by task ID.
 * Sends SIGTERM to the process and removes it from tracking.
 *
 * @param taskId - The task ID of the agent to stop
 * @returns true if agent was found and stopped, false if no agent was running for this task
 */
export function stopAgent(taskId: string): boolean {
  const logger = getLogger();
  const agent = getAgent(taskId);
  if (!agent) {
    return false;
  }

  agent.process.kill('SIGTERM');
  untrackAgent(taskId);
  logger.info({ taskId }, 'Stopped agent');
  return true;
}
