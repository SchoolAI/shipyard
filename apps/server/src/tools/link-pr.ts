import {
  GitHubPRResponseSchema,
  getPlanMetadata,
  type LinkedPR,
  linkPR,
  logPlanEvent,
} from '@peer-plan/schema';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { getOctokit, parseRepoString } from '../github-artifacts.js';
import { logger } from '../logger.js';
import { getGitHubUsername } from '../server-identity.js';
import { verifySessionToken } from '../session-token.js';
import { TOOL_NAMES } from './tool-names.js';

// --- Input Schema ---

const LinkPRInput = z.object({
  planId: z.string().describe('Plan ID'),
  sessionToken: z.string().describe('Session token from create_plan'),
  prNumber: z.number().describe('PR number to link'),
  branch: z.string().optional().describe('Branch name (optional, will be fetched if omitted)'),
  repo: z
    .string()
    .optional()
    .describe('Repository override (org/repo). Uses plan repo if omitted.'),
});

// --- Public Export ---

export const linkPRTool = {
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
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        prNumber: { type: 'number', description: 'PR number to link' },
        branch: {
          type: 'string',
          description: 'Branch name (optional, will be fetched if omitted)',
        },
        repo: {
          type: 'string',
          description: 'Repository override (org/repo). Uses plan repo if omitted.',
        },
      },
      required: ['planId', 'sessionToken', 'prNumber'],
    },
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tool handler requires validation, GitHub API call, error handling
  handler: async (args: unknown) => {
    const input = LinkPRInput.parse(args);

    logger.info(
      { planId: input.planId, prNumber: input.prNumber, repo: input.repo },
      'Linking PR to plan'
    );

    const ydoc = await getOrCreateDoc(input.planId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata) {
      return {
        content: [{ type: 'text', text: `Plan "${input.planId}" not found.` }],
        isError: true,
      };
    }

    // Verify session token
    if (
      !metadata.sessionTokenHash ||
      !verifySessionToken(input.sessionToken, metadata.sessionTokenHash)
    ) {
      return {
        content: [{ type: 'text', text: `Invalid session token for plan "${input.planId}".` }],
        isError: true,
      };
    }

    // Determine repo
    const repo = input.repo || metadata.repo;
    if (!repo) {
      return {
        content: [
          {
            type: 'text',
            text: 'No repository specified. Provide repo parameter or set plan repo.',
          },
        ],
        isError: true,
      };
    }

    // Get Octokit instance
    const octokit = getOctokit();
    if (!octokit) {
      return {
        content: [
          {
            type: 'text',
            text: 'GitHub authentication required. Set GITHUB_TOKEN environment variable or run: gh auth login',
          },
        ],
        isError: true,
      };
    }

    // Parse repo
    const { owner, repoName } = parseRepoString(repo);

    try {
      // Fetch PR details from GitHub
      const { data: pr } = await octokit.pulls.get({
        owner,
        repo: repoName,
        pull_number: input.prNumber,
      });

      // Validate GitHub API response
      const validatedPR = GitHubPRResponseSchema.parse(pr);

      // Create LinkedPR object
      const linkedPR: LinkedPR = {
        prNumber: input.prNumber,
        url: validatedPR.html_url,
        linkedAt: Date.now(),
        status: validatedPR.merged
          ? 'merged'
          : validatedPR.state === 'closed'
            ? 'closed'
            : validatedPR.draft
              ? 'draft'
              : 'open',
        branch: input.branch || validatedPR.head.ref,
        title: validatedPR.title,
      };

      // Get actor name for event logging
      const actorName = await getGitHubUsername();

      // Store in Y.Doc
      linkPR(ydoc, linkedPR, actorName);

      // Log PR linked event (semantic action)
      logPlanEvent(ydoc, 'pr_linked', actorName, {
        prNumber: linkedPR.prNumber,
        url: linkedPR.url,
      });

      logger.info(
        { planId: input.planId, prNumber: input.prNumber, status: linkedPR.status },
        'PR linked successfully'
      );

      return {
        content: [
          {
            type: 'text',
            text: `PR linked successfully!

PR: #${linkedPR.prNumber} - ${linkedPR.title}
Status: ${linkedPR.status}
Branch: ${linkedPR.branch}
URL: ${linkedPR.url}

The PR is now visible in the "Changes" tab of your plan.`,
          },
        ],
      };
    } catch (error) {
      logger.error({ error, planId: input.planId, prNumber: input.prNumber }, 'Failed to link PR');

      // Check if this is a validation error
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: 'text',
              text: `GitHub API returned invalid data for PR #${input.prNumber}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      const message =
        error instanceof Error ? error.message : 'Unknown error while fetching PR from GitHub';

      return {
        content: [
          {
            type: 'text',
            text: `Failed to link PR #${input.prNumber}: ${message}

Make sure:
- The PR exists in the repository
- You have access to the repository
- GitHub token has correct permissions`,
          },
        ],
        isError: true,
      };
    }
  },
};
