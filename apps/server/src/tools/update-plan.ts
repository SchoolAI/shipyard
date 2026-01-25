import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  addSnapshot,
  createPlanSnapshot,
  getPlanIndexDocName,
  getPlanMetadata,
  type PlanStatusType,
  resetPlanToDraft,
  type StatusTransition,
  setPlanIndexEntry,
  setPlanMetadata,
  transitionPlanStatus,
} from '@shipyard/schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { logger } from '../logger.js';
import { getGitHubUsername } from '../server-identity.js';
import { verifySessionToken } from '../session-token.js';
import { TOOL_NAMES } from './tool-names.js';

/**
 * Build a proper StatusTransition object with all required fields.
 * This ensures the discriminated union is always valid.
 */
function buildStatusTransition(
  targetStatus: PlanStatusType,
  actorName: string
): StatusTransition | null {
  const now = Date.now();

  switch (targetStatus) {
    case 'pending_review':
      return {
        status: 'pending_review',
        reviewRequestId: nanoid(),
      };
    case 'changes_requested':
      return {
        status: 'changes_requested',
        reviewedAt: now,
        reviewedBy: actorName,
      };
    case 'in_progress':
      // in_progress requires reviewedAt/reviewedBy per the PlanMetadata schema
      return {
        status: 'in_progress',
        reviewedAt: now,
        reviewedBy: actorName,
      };
    case 'completed':
      return {
        status: 'completed',
        completedAt: now,
        completedBy: actorName,
      };
    case 'draft':
      // Draft is handled separately via resetPlanToDraft()
      return null;
    default:
      return null;
  }
}

const UpdatePlanInput = z.object({
  planId: z.string().describe('The plan ID to update'),
  sessionToken: z.string().describe('Session token from create_plan'),
  title: z.string().optional().describe('New title'),
  status: z
    .enum(['draft', 'pending_review', 'changes_requested', 'in_progress', 'completed'])
    .optional()
    .describe('New status'),
  tags: z.array(z.string()).optional().describe('Updated tags (replaces existing tags)'),
});

export const updatePlanTool = {
  definition: {
    name: TOOL_NAMES.UPDATE_PLAN,
    description: `Update an existing plan's metadata (title, status). Does not modify content—use update_block_content for that.

NOTE: Most status transitions are automatic. You rarely need to call this tool.

AUTOMATIC TRANSITIONS:
- draft → in_progress/changes_requested: Set by human in browser
- in_progress → completed: Auto-set when all deliverables have artifacts

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
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to update' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        title: { type: 'string', description: 'New title (optional)' },
        status: {
          type: 'string',
          enum: ['draft', 'pending_review', 'changes_requested', 'in_progress', 'completed'],
          description:
            "New status (optional). Use 'pending_review' to signal ready for human feedback.",
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated tags (optional, replaces existing tags)',
        },
      },
      required: ['planId', 'sessionToken'],
    },
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tool handler orchestrates validation, snapshots, and state transitions
  handler: async (args: unknown) => {
    const input = UpdatePlanInput.parse(args);
    const doc = await getOrCreateDoc(input.planId);
    const existingMetadata = getPlanMetadata(doc);

    // Get actor name for event logging
    const actorName = await getGitHubUsername();

    if (!existingMetadata) {
      return {
        content: [
          {
            type: 'text',
            text: `Plan "${input.planId}" not found.`,
          },
        ],
        isError: true,
      };
    }

    // Verify session token
    if (
      !existingMetadata.sessionTokenHash ||
      !verifySessionToken(input.sessionToken, existingMetadata.sessionTokenHash)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid session token for plan "${input.planId}".`,
          },
        ],
        isError: true,
      };
    }

    // Handle status change separately from other metadata updates
    // Status changes MUST go through transitionPlanStatus() or resetPlanToDraft()
    // to ensure required fields are set and state machine is validated
    const statusChanged = input.status && input.status !== existingMetadata.status;

    if (statusChanged && input.status) {
      // Create snapshot on status change (Issue #42)
      const editor = ServerBlockNoteEditor.create();
      const fragment = doc.getXmlFragment('document');
      const blocks = editor.yXmlFragmentToBlocks(fragment);

      const reason = `Status changed to ${input.status}`;
      const snapshot = createPlanSnapshot(doc, reason, actorName, input.status, blocks);
      addSnapshot(doc, snapshot);

      // Handle status transition with proper validation
      if (input.status === 'draft') {
        // Reset to draft is a special operation (not a forward transition)
        const resetResult = resetPlanToDraft(doc, actorName);
        if (!resetResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to reset plan to draft: ${resetResult.error}`,
              },
            ],
            isError: true,
          };
        }
      } else {
        // Forward transition - build proper transition object with required fields
        const transition = buildStatusTransition(input.status, actorName);
        if (!transition) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid status: ${input.status}`,
              },
            ],
            isError: true,
          };
        }

        const transitionResult = transitionPlanStatus(doc, transition, actorName);
        if (!transitionResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to transition status: ${transitionResult.error}`,
              },
            ],
            isError: true,
          };
        }
      }
    }

    // Update non-status fields (title, tags) via setPlanMetadata
    // Note: setPlanMetadata should NOT be used for status changes
    const updates: { title?: string; tags?: string[] } = {};
    if (input.title) updates.title = input.title;
    if (input.tags !== undefined) updates.tags = input.tags;

    // Only call setPlanMetadata if there are non-status updates
    if (Object.keys(updates).length > 0) {
      setPlanMetadata(doc, updates, actorName);
    }

    if (existingMetadata.ownerId) {
      const indexDoc = await getOrCreateDoc(getPlanIndexDocName(existingMetadata.ownerId));
      setPlanIndexEntry(indexDoc, {
        id: existingMetadata.id,
        title: input.title ?? existingMetadata.title,
        status: input.status ?? existingMetadata.status,
        createdAt: existingMetadata.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        ownerId: existingMetadata.ownerId,
        tags: input.tags ?? existingMetadata.tags,
        deleted: false,
      });
    } else {
      logger.warn({ planId: input.planId }, 'Cannot update plan index: missing ownerId');
    }

    logger.info({ planId: input.planId, updates }, 'Plan updated');

    return {
      content: [
        {
          type: 'text',
          text: `Plan "${input.planId}" updated successfully.`,
        },
      ],
    };
  },
};
