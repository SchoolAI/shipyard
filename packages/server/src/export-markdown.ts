import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { extractTextFromCommentBody, parseThreads, type Thread } from '@peer-plan/schema';
import type * as Y from 'yjs';

// --- Public API ---

export interface ExportOptions {
  /** Include resolved threads (default: false) */
  includeResolved?: boolean;
  /** Max length for selected text preview (default: 100) */
  selectedTextMaxLength?: number;
}

/**
 * Export a plan Y.Doc to markdown with reviewer feedback appended.
 *
 * Uses BlockNote's server-side converter for the document content,
 * then appends a structured feedback section from comment threads.
 */
export async function exportPlanToMarkdown(
  ydoc: Y.Doc,
  options: ExportOptions = {}
): Promise<string> {
  const { includeResolved = false, selectedTextMaxLength = 100 } = options;

  // Convert document content to markdown
  const editor = ServerBlockNoteEditor.create();
  const fragment = ydoc.getXmlFragment('document');
  const blocks = editor.yXmlFragmentToBlocks(fragment);
  const contentMarkdown = await editor.blocksToMarkdownLossy(blocks);

  // Get threads
  const threadsMap = ydoc.getMap('threads');
  const threadsData = threadsMap.toJSON() as Record<string, unknown>;
  const allThreads = parseThreads(threadsData);

  // Format feedback section
  const feedbackMarkdown = formatFeedbackSection(allThreads, {
    includeResolved,
    selectedTextMaxLength,
  });

  // Combine
  if (!feedbackMarkdown) {
    return contentMarkdown;
  }

  return `${contentMarkdown}\n\n---\n\n${feedbackMarkdown}`;
}

/**
 * Format just the feedback section (without document content).
 * Useful if you already have the markdown or want feedback standalone.
 */
export function formatFeedbackSection(threads: Thread[], options: ExportOptions = {}): string {
  const { includeResolved = false, selectedTextMaxLength = 100 } = options;

  const unresolvedThreads = threads.filter((t) => !t.resolved);
  const resolvedCount = threads.length - unresolvedThreads.length;

  const threadsToShow = includeResolved ? threads : unresolvedThreads;

  if (threadsToShow.length === 0) {
    if (resolvedCount > 0) {
      return `## Reviewer Feedback\n\nAll ${resolvedCount} comment(s) have been resolved.`;
    }
    return '';
  }

  let output = '## Reviewer Feedback\n\n';

  threadsToShow.forEach((thread, index) => {
    output += formatThread(thread, index + 1, selectedTextMaxLength);
    output += '\n';
  });

  // Add resolved summary if we're not showing them
  if (!includeResolved && resolvedCount > 0) {
    output += `---\n*${resolvedCount} resolved comment(s) not shown*\n`;
  }

  return output;
}

// --- Private Helpers ---

function formatThread(thread: Thread, number: number, selectedTextMaxLength: number): string {
  let output = `### ${number}. `;

  // Header with selected text or "General"
  if (thread.selectedText) {
    const preview = truncate(thread.selectedText, selectedTextMaxLength);
    output += `On: "${preview}"\n`;
  } else {
    output += 'General\n';
  }

  // Resolved marker
  if (thread.resolved) {
    output += '*[Resolved]*\n';
  }

  // Comments
  thread.comments.forEach((comment, idx) => {
    const bodyText = extractTextFromCommentBody(comment.body);

    if (idx === 0) {
      // First comment is the main feedback
      output += `> ${bodyText}\n`;
    } else {
      // Subsequent comments are replies
      output += `>\n> **Reply:** ${bodyText}\n`;
    }
  });

  return output;
}

function truncate(text: string, maxLength: number): string {
  const cleaned = text.replace(/\n/g, ' ').trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength)}...`;
}
