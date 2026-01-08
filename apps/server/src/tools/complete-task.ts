import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  createPlanUrl,
  getArtifacts,
  getPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  setPlanIndexEntry,
  setPlanMetadata,
} from '@peer-plan/schema';
import { z } from 'zod';
import { logger } from '../logger.js';
import { verifySessionToken } from '../session-token.js';
import { getOrCreateDoc } from '../ws-server.js';
import { TOOL_NAMES } from './tool-names.js';

const CompleteTaskInput = z.object({
  planId: z.string().describe('ID of the plan to complete'),
  sessionToken: z.string().describe('Session token from create_plan'),
  summary: z.string().optional().describe('Optional completion summary'),
});

export const completeTaskTool = {
  definition: {
    name: TOOL_NAMES.COMPLETE_TASK,
    description: `Mark a task as complete after all deliverables are attached. Returns a snapshot URL for embedding in a PR.

REQUIREMENTS:
- Plan status must be 'in_progress'
- At least one artifact must be uploaded (deliverables with proof)
- Use add_artifact tool to upload screenshots, videos, test results, or diffs
- Deliverables are checkbox items marked with {#deliverable} in create_plan or update_block_content

WORKFLOW:
1. Create plan with deliverables: create_plan (use {#deliverable} markers)
2. Upload artifacts: add_artifact (link to deliverable IDs from read_plan)
3. Complete task: complete_task (generates snapshot URL)
4. Embed snapshot URL in PR description`,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'ID of the plan to complete' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        summary: {
          type: 'string',
          description: 'Optional completion summary for PR description',
        },
      },
      required: ['planId', 'sessionToken'],
    },
  },

  handler: async (args: unknown) => {
    const input = CompleteTaskInput.parse(args);
    const ydoc = await getOrCreateDoc(input.planId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata) {
      return {
        content: [{ type: 'text', text: 'Plan not found' }],
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

    // Validate status (must be in_progress)
    if (metadata.status !== 'in_progress') {
      return {
        content: [
          {
            type: 'text',
            text: `Cannot complete: plan status is '${metadata.status}', must be 'in_progress'`,
          },
        ],
        isError: true,
      };
    }

    // Check artifacts exist
    const artifacts = getArtifacts(ydoc);
    if (artifacts.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Cannot complete: no deliverables attached. Upload artifacts first using add_artifact.',
          },
        ],
        isError: true,
      };
    }

    // Get content blocks from Y.Doc
    const editor = ServerBlockNoteEditor.create();
    const fragment = ydoc.getXmlFragment('document');
    const blocks = editor.yXmlFragmentToBlocks(fragment);

    // Generate snapshot URL
    const baseUrl = process.env.PEER_PLAN_BASE_URL || 'http://localhost:5173';
    const snapshotUrl = createPlanUrl(baseUrl, {
      v: 1,
      id: input.planId,
      title: metadata.title,
      status: 'completed',
      repo: metadata.repo,
      pr: metadata.pr,
      content: blocks,
      artifacts,
    });

    // Update metadata
    setPlanMetadata(ydoc, {
      status: 'completed',
      completedAt: Date.now(),
      completedBy: 'agent',
      snapshotUrl,
    });

    // Update plan index
    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: metadata.id,
      title: metadata.title,
      status: 'completed',
      createdAt: metadata.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });

    logger.info({ planId: input.planId }, 'Task marked complete');

    return {
      content: [
        {
          type: 'text',
          text: `Task completed!

Snapshot URL: ${snapshotUrl}

Suggested next step: Create a PR with this URL embedded in the description:

\`\`\`
gh pr create --title "${metadata.title}" --body "## Summary
${input.summary || 'Task completed.'}

## Deliverables
[View Plan + Artifacts](${snapshotUrl})

---
Generated with [Peer-Plan](https://github.com/SchoolAI/peer-plan)"
\`\`\`
`,
        },
      ],
    };
  },
};
