/**
 * MCP Tool: create_task
 *
 * Creates a new task in the Loro document.
 * Ported from apps/server-legacy/src/tools/create-task.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { generateTaskId, getTaskUrl } from '@shipyard/loro-schema';
import { z } from 'zod';
import { parseEnv } from '../../env.js';

/** Creates a Tiptap heading node */
function createHeadingNode(level: 1 | 2 | 3, text: string): object {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

/** Creates a Tiptap checkbox/task item node */
function createTaskItemNode(checked: boolean, text: string): object {
  return {
    type: 'taskItem',
    attrs: { checked },
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

/** Creates a Tiptap bullet list item node */
function createBulletListItemNode(text: string): object {
  return {
    type: 'bulletListItem',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

/** Creates a Tiptap paragraph node */
function createParagraphNode(text?: string): object {
  if (!text) {
    return { type: 'paragraph' };
  }
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

/** Parses a single markdown line into a Tiptap node */
function parseMarkdownLine(line: string): object {
  if (line.trim() === '') {
    return createParagraphNode();
  }

  if (line.startsWith('# ')) {
    return createHeadingNode(1, line.slice(2));
  }

  if (line.startsWith('## ')) {
    return createHeadingNode(2, line.slice(3));
  }

  if (line.startsWith('### ')) {
    return createHeadingNode(3, line.slice(4));
  }

  if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
    const checked = line.startsWith('- [x] ');
    return createTaskItemNode(checked, line.slice(6));
  }

  if (line.startsWith('- ')) {
    return createBulletListItemNode(line.slice(2));
  }

  return createParagraphNode(line);
}

/**
 * Convert markdown content to simple Tiptap JSON structure.
 * This creates a basic document with paragraphs that Tiptap can render.
 */
function markdownToTiptapJson(markdown: string): object {
  const lines = markdown.split('\n');
  const content = lines.map(parseMarkdownLine);

  return {
    type: 'doc',
    content: content.length > 0 ? content : [createParagraphNode()],
  };
}

import type { TaskDocument } from '@shipyard/loro-schema';
import {
  getEnvironmentContext,
  getGitHubUsername,
  getRepositoryFullName,
} from '../../utils/identity.js';
import { logger } from '../../utils/logger.js';
import { generateSessionToken, hashSessionToken } from '../../utils/session-token.js';
import { getOrCreateTaskDocument } from '../helpers.js';
import type { McpServer } from '../index.js';

/** Tool name constant */
const TOOL_NAME = 'create_task';

/** Origin platforms for conversation export */
const OriginPlatformValues = [
  'claude-code',
  'cursor',
  'devin',
  'windsurf',
  'cline',
  'continue',
  'aider',
  'codex',
  'vscode',
  'zed',
  'browser',
  'unknown',
] as const;

/** Input Schema */
const CreateTaskInput = z.object({
  title: z.string().describe('Task title'),
  content: z.string().describe('Task content (markdown)'),
  repo: z.string().optional().describe('GitHub repo (org/repo)'),
  prNumber: z.number().optional().describe('PR number'),
  originPlatform: z
    .enum(OriginPlatformValues)
    .optional()
    .describe('Platform where this plan originated (for conversation export)'),
  originSessionId: z.string().optional().describe('Platform-specific session ID'),
  originMetadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Platform-specific metadata for conversation export'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Tags for categorization (e.g., ["ui", "bug", "project:mobile-app"])'),
});

/** Inferred input type from CreateTaskInput schema */
type CreateTaskInputType = z.infer<typeof CreateTaskInput>;

/** Resolves the repository from input or auto-detection */
function resolveRepository(inputRepo: string | undefined): string | undefined {
  if (inputRepo) {
    return inputRepo;
  }
  const detected = getRepositoryFullName();
  if (detected) {
    logger.info({ repo: detected }, 'Auto-detected repository from current directory');
    return detected;
  }
  return undefined;
}

/** Initializes task metadata on the document */
function initializeTaskMetadata(
  doc: TaskDocument,
  taskId: string,
  input: CreateTaskInputType,
  sessionTokenHash: string,
  ownerId: string | null,
  repo: string | undefined,
  now: number
): void {
  const meta = doc.meta;
  meta.id = taskId;
  meta.title = input.title;
  meta.status = 'pending_review';
  meta.createdAt = now;
  meta.updatedAt = now;
  meta.ownerId = ownerId;
  meta.sessionTokenHash = sessionTokenHash;
  meta.epoch = 1;
  meta.repo = repo ?? null;
  // Tasks created from MCP agent are public by default (no approval required)
  meta.approvalRequired = false;

  if (input.tags) {
    for (const tag of input.tags) {
      meta.tags.push(tag);
    }
  }
}

/** Stores task content as Tiptap JSON if provided */
function storeTaskContent(doc: TaskDocument, content: string | undefined): void {
  if (!content) {
    return;
  }
  const tiptapContent = markdownToTiptapJson(content);
  doc.taskDoc.content = tiptapContent;
  logger.debug({ contentKeys: Object.keys(tiptapContent) }, 'Stored task content');
}

/** Builds the repository info string for response */
function buildRepoInfoString(repo: string | undefined, wasProvided: boolean): string {
  if (!repo) {
    return 'Repo: Not set (provide repo and prNumber for artifact uploads)';
  }
  const suffix = wasProvided ? '' : ' (auto-detected)';
  return `Repo: ${repo}${suffix}`;
}

/** Builds the success response for task creation */
function buildSuccessResponse(
  taskId: string,
  sessionToken: string,
  repoInfo: string,
  url: string
): { content: Array<{ type: string; text: string }> } {
  const envContext = getEnvironmentContext();
  const projectName = envContext.projectName || 'unknown';
  const branch = envContext.branch || 'unknown';

  return {
    content: [
      {
        type: 'text',
        text: `Task created!
ID: ${taskId}
Session Token: ${sessionToken}
${repoInfo}
URL: ${url}
Context: ${projectName} / ${branch}

IMPORTANT: Save the session token - it's required for add_artifact calls.

Next steps:
1. Wait for human to review and approve the task in the browser
2. Once approved, use add_artifact to upload proof for each deliverable
3. When all deliverables have artifacts, the task auto-completes with a snapshot URL`,
      },
    ],
  };
}

/**
 * Register the create_task tool.
 */
export function registerCreateTaskTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    `Create a new implementation task and open it in browser.

NOTE FOR CLAUDE CODE USERS: If you have the shipyard hook installed, use native plan mode (Shift+Tab) instead of this tool. The hook handles task creation automatically and provides a better experience.

This tool is for agents WITHOUT hook support (Cursor, Devin, etc).

DELIVERABLES: Mark checkbox items as deliverables using {#deliverable} marker. Deliverables are measurable outcomes you can prove with artifacts.

Good deliverables (provable with artifacts):
- [ ] Screenshot of working feature {#deliverable}
- [ ] Video demo of user flow {#deliverable}
- [ ] Test results showing all tests pass {#deliverable}

Bad deliverables (not provable):
- [ ] Implement the API  <- This is a task, not a deliverable
- [ ] Add error handling <- Can't prove this with an artifact`,
    {
      title: { type: 'string', description: 'Task title' },
      content: {
        type: 'string',
        description:
          'Task content in markdown. Use {#deliverable} marker on checkbox items to mark them as deliverables that can be linked to artifacts.',
      },
      repo: {
        type: 'string',
        description:
          'GitHub repo (org/repo). Auto-detected from current directory if not provided. Required for artifact uploads.',
      },
      prNumber: {
        type: 'number',
        description: 'PR number. Required for artifact uploads.',
      },
      originPlatform: {
        type: 'string',
        enum: [...OriginPlatformValues],
        description: 'Platform where this plan originated. Used for conversation export/import.',
      },
      originSessionId: {
        type: 'string',
        description:
          'Platform-specific session ID. Include this so conversation history can be exported later.',
      },
      originMetadata: {
        type: 'object',
        description: 'Platform-specific metadata for conversation export.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Tags for categorization (e.g., ["ui", "bug", "project:mobile-app"]). Use conventions like "project:name" for grouping.',
      },
    },
    async (args: unknown) => {
      const input = CreateTaskInput.parse(args);
      const taskId = generateTaskId();
      const sessionToken = generateSessionToken();
      const sessionTokenHash = hashSessionToken(sessionToken);
      const now = Date.now();

      const repo = resolveRepository(input.repo);
      logger.info({ taskId, title: input.title, repo }, 'Creating task');

      const ownerId = await getGitHubUsername();
      logger.info({ ownerId }, 'GitHub username for task ownership');

      const taskResult = await getOrCreateTaskDocument(taskId);
      if (!taskResult.success) {
        return {
          content: [{ type: 'text', text: taskResult.error }],
          isError: true,
        };
      }
      const { doc } = taskResult;

      initializeTaskMetadata(doc, taskId, input, sessionTokenHash, ownerId, repo, now);
      doc.logEvent('task_created', ownerId);
      storeTaskContent(doc, input.content);

      const env = parseEnv();
      const url = getTaskUrl(taskId, env.WEB_URL);
      const repoInfo = buildRepoInfoString(repo, Boolean(input.repo));

      return buildSuccessResponse(taskId, sessionToken, repoInfo, url);
    }
  );
}
