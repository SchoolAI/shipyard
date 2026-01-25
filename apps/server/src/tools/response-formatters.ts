/**
 * Shared response formatting helpers for tool handlers.
 * Extracted to reduce cognitive complexity and enable reuse.
 */
import type { LinkedPR, PlanMetadata } from '@shipyard/schema';

/**
 * Formats the metadata header section for plan output.
 */
export function formatPlanHeader(metadata: PlanMetadata): string {
  let output = `# ${metadata.title}\n\n`;
  output += `**Status:** ${metadata.status.replace('_', ' ')}\n`;

  if (metadata.repo) {
    output += `**Repo:** ${metadata.repo}\n`;
  }

  if (metadata.pr) {
    output += `**PR:** #${metadata.pr}\n`;
  }

  output += `**Created:** ${new Date(metadata.createdAt).toISOString()}\n`;
  output += `**Updated:** ${new Date(metadata.updatedAt).toISOString()}\n`;

  if (metadata.status === 'changes_requested' && metadata.reviewComment) {
    output += `\n**Reviewer Comment:** ${metadata.reviewComment}\n`;
  }

  output += '\n---\n\n';
  return output;
}

/**
 * Formats the linked PRs section for plan output.
 */
export function formatLinkedPRsSection(linkedPRs: LinkedPR[]): string {
  if (linkedPRs.length === 0) {
    return '';
  }

  let output = '\n\n---\n\n';
  output += '## Linked PRs\n\n';

  for (const pr of linkedPRs) {
    output += `- **#${pr.prNumber}** (${pr.status})`;
    if (pr.title) {
      output += ` - ${pr.title}`;
    }
    output += '\n';
    output += `  - URL: ${pr.url}\n`;
    if (pr.branch) {
      output += `  - Branch: ${pr.branch}\n`;
    }
    output += `  - Linked: ${new Date(pr.linkedAt).toISOString()}\n`;
  }

  return output;
}

interface CompletionResponseParams {
  metadata: PlanMetadata;
  snapshotUrl: string;
  linkedPR: LinkedPR | null;
  existingLinkedPRs: LinkedPR[];
  hasLocalArtifacts: boolean;
  summary?: string;
}

/**
 * Builds the completion response message for complete-task.
 */
export function buildCompletionResponse(params: CompletionResponseParams): string {
  const { metadata, snapshotUrl, linkedPR, existingLinkedPRs, hasLocalArtifacts, summary } = params;

  let responseText = `Task completed!\n\nSnapshot URL: ${snapshotUrl}`;

  if (linkedPR) {
    responseText += `\n\nLinked PR: #${linkedPR.prNumber} (${linkedPR.status})
Branch: ${linkedPR.branch}
URL: ${linkedPR.url}

The PR is now visible in the "Changes" tab of your plan.`;
  } else if (!metadata.repo) {
    responseText += `\n\nNote: No PR auto-linked (plan has no repo set).`;
  } else if (existingLinkedPRs.length > 0) {
    responseText += `\n\nExisting linked PR: #${existingLinkedPRs[0]?.prNumber}`;
  } else {
    responseText += `\n\nNo open PR found on current branch. You can:

1. Create a new PR:
\`\`\`
gh pr create --title "${metadata.title}" --body "## Summary
${summary || 'Task completed.'}

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

  /** Add warning if plan contains local artifacts */
  if (hasLocalArtifacts) {
    responseText +=
      '\n\n⚠️ WARNING: This plan contains local artifacts that will not be visible to remote viewers. For full remote access, configure GITHUB_TOKEN to upload artifacts to GitHub.';
  }

  return responseText;
}
