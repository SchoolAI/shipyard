import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  createUserResolver,
  extractTextFromCommentBody,
  parseThreads,
  type Thread,
} from '@peer-plan/schema';
import type * as Y from 'yjs';

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
  const threadsMap = ydoc.getMap('threads');
  const threadsData = threadsMap.toJSON() as Record<string, unknown>;
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

  // Combine
  if (!feedbackMarkdown) {
    return contentMarkdown;
  }

  return `${contentMarkdown}\n\n---\n\n${feedbackMarkdown}`;
}

/**
 * Extract text content for each thread by finding marks in the XmlFragment.
 * BlockNote stores thread references as spans with data-bn-thread-id attribute.
 */
function extractThreadTextFromFragment(fragment: Y.XmlFragment): Map<string, string> {
  const threadTextMap = new Map<string, string>();

  // Walk through all XML elements looking for thread marks
  for (const node of fragment.createTreeWalker(() => true)) {
    // Check if this is an XmlElement with thread mark attributes
    if ('getAttribute' in node && typeof node.getAttribute === 'function') {
      const threadId = node.getAttribute('data-bn-thread-id');
      if (threadId) {
        // Extract text content from this marked span
        const text = extractTextFromXmlNode(node);
        if (text) {
          // Accumulate text for this thread (marks may span multiple nodes)
          const existing = threadTextMap.get(threadId) || '';
          threadTextMap.set(threadId, existing + text);
        }
      }
    }
  }

  return threadTextMap;
}

/**
 * Extract plain text from an XML node and its children.
 */
function extractTextFromXmlNode(node: Y.XmlElement | Y.XmlText): string {
  // If it's a text node, return its string content
  if ('toString' in node && node.constructor.name === 'YXmlText') {
    return node.toString();
  }

  // For element nodes, recursively extract text from children
  if ('toArray' in node && typeof node.toArray === 'function') {
    const children = node.toArray() as Array<Y.XmlElement | Y.XmlText>;
    return children.map((child) => extractTextFromXmlNode(child)).join('');
  }

  return '';
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
