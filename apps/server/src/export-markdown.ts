import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  createUserResolver,
  extractTextFromCommentBody,
  getPlanMetadata,
  parseThreads,
  type Thread,
  YDOC_KEYS,
} from '@shipyard/schema';
import * as Y from 'yjs';

// --- Constants ---

/**
 * BlockNote's thread mark attribute names. Multiple formats checked
 * because the internal format is undocumented and may change.
 */
const THREAD_MARK_ATTRS = {
  COMMENT_THREAD_MARK: 'commentThreadMark',
  THREAD_MARK: 'threadMark',
  COMMENT_THREAD: 'commentThread',
} as const;

// --- Public API ---

export interface ExportOptions {
  /** Include resolved threads (default: false) */
  includeResolved?: boolean;
  /** Max length for selected text preview (default: 100) */
  selectedTextMaxLength?: number;
}

/**
 * Thread with selected text extracted from the document.
 */
interface ThreadWithText extends Thread {
  selectedText?: string;
}

/**
 * Export a plan Y.Doc to markdown with reviewer feedback appended.
 *
 * Uses BlockNote's server-side converter for the document content,
 * then appends a structured feedback section from comment threads.
 *
 * Block IDs are included as HTML comments (e.g., <!-- block:abc123 -->)
 * so the AI can reference specific blocks for editing via update_block_content.
 */
export async function exportPlanToMarkdown(
  ydoc: Y.Doc,
  options: ExportOptions = {}
): Promise<string> {
  const { includeResolved = false, selectedTextMaxLength = 100 } = options;

  // Convert document content to markdown with block IDs
  const editor = ServerBlockNoteEditor.create();
  const fragment = ydoc.getXmlFragment('document');
  const blocks = editor.yXmlFragmentToBlocks(fragment);

  // Build markdown with block ID comments for AI targeting
  const markdownParts: string[] = [];
  for (const block of blocks) {
    // Add block ID as HTML comment (invisible to humans, parseable by AI)
    markdownParts.push(`<!-- block:${block.id} -->`);
    // Convert single block to markdown
    const blockMarkdown = await editor.blocksToMarkdownLossy([block]);
    markdownParts.push(blockMarkdown);
  }
  const contentMarkdown = markdownParts.join('\n');

  // Get threads and extract selected text from document marks
  const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
  const threadsData = threadsMap.toJSON();
  const allThreads = parseThreads(threadsData);

  // Extract selected text for each thread from document marks
  const threadTextMap = extractThreadTextFromFragment(fragment);
  const threadsWithText: ThreadWithText[] = allThreads.map((thread) => ({
    ...thread,
    selectedText: thread.selectedText || threadTextMap.get(thread.id),
  }));

  // Create user resolver for author names
  const resolveUser = createUserResolver(ydoc);

  // Format feedback section
  const feedbackMarkdown = formatFeedbackSection(
    threadsWithText,
    { includeResolved, selectedTextMaxLength },
    resolveUser
  );

  // Get reviewer comment from metadata using type-safe helper
  const metadata = getPlanMetadata(ydoc);
  const reviewComment =
    metadata?.status === 'changes_requested' || metadata?.status === 'in_progress'
      ? metadata.reviewComment
      : undefined;
  const reviewedBy =
    metadata?.status === 'changes_requested' || metadata?.status === 'in_progress'
      ? metadata.reviewedBy
      : undefined;

  // Build output with optional sections
  const sections: string[] = [contentMarkdown];

  // Add reviewer comment if present
  if (reviewComment) {
    let reviewerSection = '## Reviewer Comment\n\n';
    reviewerSection += `> **${reviewedBy ?? 'Reviewer'}:** ${reviewComment}\n`;
    sections.push(reviewerSection);
  }

  // Add thread feedback if present
  if (feedbackMarkdown) {
    sections.push(feedbackMarkdown);
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Extract selected text for threads that don't have it in their metadata.
 * BlockNote doesn't always populate selectedText in the thread object,
 * so we reconstruct it from ProseMirror marks in the document.
 */
function extractThreadTextFromFragment(fragment: Y.XmlFragment): Map<string, string> {
  const threadTextMap = new Map<string, string>();

  for (const node of fragment.createTreeWalker(() => true)) {
    if (node instanceof Y.XmlText) {
      const attrs = node.getAttributes();
      const threadId = extractThreadIdFromAttrs(attrs);

      if (threadId) {
        const text = node.toString();
        if (text) {
          const existing = threadTextMap.get(threadId) || '';
          threadTextMap.set(threadId, existing + text);
        }
      }
    }
  }

  return threadTextMap;
}

/**
 * BlockNote's internal attribute format is undocumented and may change between versions.
 * We defensively check multiple possible formats to avoid breaking on BlockNote updates.
 */
function extractThreadIdFromAttrs(attrs: Record<string, unknown>): string | null {
  const primaryAttr = attrs[THREAD_MARK_ATTRS.COMMENT_THREAD_MARK];
  if (typeof primaryAttr === 'string') {
    return primaryAttr;
  }
  if (typeof primaryAttr === 'object' && primaryAttr && 'id' in primaryAttr) {
    const attrRecord = Object.fromEntries(Object.entries(primaryAttr));
    const id = attrRecord.id;
    if (typeof id === 'string') {
      return id;
    }
  }

  const altAttr1 = attrs[THREAD_MARK_ATTRS.THREAD_MARK];
  if (typeof altAttr1 === 'string') {
    return altAttr1;
  }

  const altAttr2 = attrs[THREAD_MARK_ATTRS.COMMENT_THREAD];
  if (typeof altAttr2 === 'string') {
    return altAttr2;
  }

  return null;
}

/**
 * Format just the feedback section (without document content).
 * Useful if you already have the markdown or want feedback standalone.
 *
 * @param threads - Threads to format
 * @param options - Export options
 * @param resolveUser - Optional function to resolve user IDs to display names
 */
export function formatFeedbackSection(
  threads: Thread[],
  options: ExportOptions = {},
  resolveUser?: (userId: string) => string
): string {
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
    output += formatThread(thread, index + 1, selectedTextMaxLength, resolveUser);
    output += '\n';
  });

  // Add resolved summary if we're not showing them
  if (!includeResolved && resolvedCount > 0) {
    output += `---\n*${resolvedCount} resolved comment(s) not shown*\n`;
  }

  return output;
}

// --- Private Helpers ---

function formatThread(
  thread: Thread,
  number: number,
  selectedTextMaxLength: number,
  resolveUser?: (userId: string) => string
): string {
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
    const authorName = resolveUser ? resolveUser(comment.userId) : comment.userId.slice(0, 8);

    if (idx === 0) {
      // First comment is the main feedback
      output += `> **${authorName}:** ${bodyText}\n`;
    } else {
      // Subsequent comments are replies
      output += `>\n> **${authorName} (Reply):** ${bodyText}\n`;
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
