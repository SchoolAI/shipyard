import { atomicRegenerateTokenIfOwner, getPlanMetadata, logPlanEvent } from '@shipyard/schema';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { logger } from '../logger.js';
import { getVerifiedGitHubUsername } from '../server-identity.js';
import { generateSessionToken, hashSessionToken } from '../session-token.js';
import { TOOL_NAMES } from './tool-names.js';

// --- Input Schema ---
const RegenerateSessionTokenInput = z.object({
  planId: z.string().describe('The plan ID to regenerate token for'),
});

// --- Public Export ---
export const regenerateSessionTokenTool = {
  definition: {
    name: TOOL_NAMES.REGENERATE_SESSION_TOKEN,
    description: `Regenerate the session token for a plan.

USE WHEN:
- Your Claude Code session ended and you lost the original token
- You need to resume work on a plan you own
- The old token may have been compromised

REQUIREMENTS:
- You must be the plan owner (verified via GitHub identity)
- The plan must exist and have an ownerId set

RETURNS:
- New session token that can be used for add_artifact, read_plan, etc.

SECURITY:
- Only the plan owner can regenerate tokens
- Old token is immediately invalidated
- New token is returned only once - store it securely`,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to regenerate token for' },
      },
      required: ['planId'],
    },
  },

  handler: async (args: unknown) => {
    const { planId } = RegenerateSessionTokenInput.parse(args);

    logger.info({ planId }, 'Attempting to regenerate session token');

    // 1. Get current user's verified GitHub identity
    const currentUser = await getVerifiedGitHubUsername();

    if (!currentUser) {
      return {
        content: [
          {
            type: 'text',
            text: `Token regeneration requires verified GitHub authentication.

Please configure ONE of:
1. GITHUB_USERNAME environment variable
2. GITHUB_TOKEN environment variable (will verify via API)
3. Run: gh auth login

Note: git config user.name is NOT accepted for security-critical operations.`,
          },
        ],
        isError: true,
      };
    }

    // 2. Get the plan
    const doc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(doc);

    if (!metadata) {
      return {
        content: [{ type: 'text', text: `Plan "${planId}" not found.` }],
        isError: true,
      };
    }

    // 3. Verify ownership
    if (!metadata.ownerId) {
      return {
        content: [
          {
            type: 'text',
            text: `Plan "${planId}" has no owner set. Cannot regenerate token for ownerless plans.`,
          },
        ],
        isError: true,
      };
    }

    // 4. Generate new token and atomically update if still owner
    // This prevents TOCTOU race conditions where ownership could change
    // between the check above and the token update
    const newToken = generateSessionToken();
    const newTokenHash = hashSessionToken(newToken);

    const updateResult = atomicRegenerateTokenIfOwner(
      doc,
      metadata.ownerId,
      newTokenHash,
      currentUser
    );

    if (!updateResult.success) {
      // Ownership changed during operation or initial check failed
      const actualOwner = updateResult.actualOwner;
      if (actualOwner !== currentUser) {
        logger.warn(
          { planId, expectedOwner: metadata.ownerId, actualOwner, currentUser },
          'Token regeneration denied - ownership changed during operation'
        );
        return {
          content: [
            {
              type: 'text',
              text: `Access denied. You do not have permission to regenerate the session token for plan "${planId}".`,
            },
          ],
          isError: true,
        };
      }
      // If actualOwner === currentUser but still failed, something unexpected happened
      logger.error(
        { planId, expectedOwner: metadata.ownerId, actualOwner, currentUser },
        'Unexpected failure in atomic token regeneration'
      );
      return {
        content: [
          {
            type: 'text',
            text: 'Token regeneration failed due to an unexpected error. Please try again.',
          },
        ],
        isError: true,
      };
    }

    // 6. Log the event for audit trail
    logPlanEvent(doc, 'session_token_regenerated', currentUser);

    logger.info({ planId, ownerId: metadata.ownerId }, 'Session token regenerated successfully');

    return {
      content: [
        {
          type: 'text',
          text: `Session token regenerated successfully!

Plan: ${metadata.title}
Plan ID: ${planId}

New Session Token: ${newToken}

IMPORTANT: Store this token securely. The old token has been invalidated.
Use this token for add_artifact, read_plan, link_pr, and other plan operations.`,
        },
      ],
    };
  },
};
