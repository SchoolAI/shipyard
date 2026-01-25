import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  createUserResolver,
  extractTextFromCommentBody,
  getPlanEvents,
  getPlanMetadata,
  type PlanEvent,
  parseThreads,
  type Thread,
  YDOC_KEYS,
} from '@shipyard/schema';
import * as Y from 'yjs';

/**
 * NOTE: BlockNote's thread mark attribute names use multiple formats
 * because the internal format is undocumented and may change.
 */
const THREAD_MARK_ATTRS = {
  COMMENT_THREAD_MARK: 'commentThreadMark',
  THREAD_MARK: 'threadMark',
  COMMENT_THREAD: 'commentThread',
} as const;

export interface ExportOptions {
  /** Include resolved threads (default: false) */
  includeResolved?: boolean;
  /** Max length for selected text preview (default: 100) */
  selectedTextMaxLength?: number;
  /** Include activity events like input requests and responses (default: false) */
  includeActivity?: boolean;
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
  const { includeResolved = false, selectedTextMaxLength = 100, includeActivity = false } = options;

  const editor = ServerBlockNoteEditor.create();
  const fragment = ydoc.getXmlFragment('document');
  const blocks = editor.yXmlFragmentToBlocks(fragment);

  const markdownParts: string[] = [];
  for (const block of blocks) {
    markdownParts.push(`<!-- block:${block.id} -->`);
    const blockMarkdown = await editor.blocksToMarkdownLossy([block]);
    markdownParts.push(blockMarkdown);
  }
  const contentMarkdown = markdownParts.join('\n');

  const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
  const threadsData = threadsMap.toJSON();
  const allThreads = parseThreads(threadsData);

  const threadTextMap = extractThreadTextFromFragment(fragment);
  const threadsWithText: ThreadWithText[] = allThreads.map((thread) => ({
    ...thread,
    selectedText: thread.selectedText || threadTextMap.get(thread.id),
  }));

  const resolveUser = createUserResolver(ydoc);

  const feedbackMarkdown = formatFeedbackSection(
    threadsWithText,
    { includeResolved, selectedTextMaxLength },
    resolveUser
  );

  const metadata = getPlanMetadata(ydoc);
  const reviewComment =
    metadata?.status === 'changes_requested' || metadata?.status === 'in_progress'
      ? metadata.reviewComment
      : undefined;
  const reviewedBy =
    metadata?.status === 'changes_requested' || metadata?.status === 'in_progress'
      ? metadata.reviewedBy
      : undefined;

  const sections: string[] = [contentMarkdown];

  if (reviewComment) {
    let reviewerSection = '## Reviewer Comment\n\n';
    reviewerSection += `> **${reviewedBy ?? 'Reviewer'}:** ${reviewComment}\n`;
    sections.push(reviewerSection);
  }

  if (feedbackMarkdown) {
    sections.push(feedbackMarkdown);
  }

  if (includeActivity) {
    const events = getPlanEvents(ydoc);
    const activityMarkdown = formatActivitySection(events);
    if (activityMarkdown) {
      sections.push(activityMarkdown);
    }
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

  if (!includeResolved && resolvedCount > 0) {
    output += `---\n*${resolvedCount} resolved comment(s) not shown*\n`;
  }

  return output;
}

function formatThread(
  thread: Thread,
  number: number,
  selectedTextMaxLength: number,
  resolveUser?: (userId: string) => string
): string {
  let output = `### ${number}. `;

  if (thread.selectedText) {
    const preview = truncate(thread.selectedText, selectedTextMaxLength);
    output += `On: "${preview}"\n`;
  } else {
    output += 'General\n';
  }

  if (thread.resolved) {
    output += '*[Resolved]*\n';
  }

  thread.comments.forEach((comment, idx) => {
    const bodyText = extractTextFromCommentBody(comment.body);
    const authorName = resolveUser ? resolveUser(comment.userId) : comment.userId.slice(0, 8);

    if (idx === 0) {
      output += `> **${authorName}:** ${bodyText}\n`;
    } else {
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

interface InputRequestGroup {
  created?: PlanEvent;
  answered?: PlanEvent;
  declined?: PlanEvent;
}

/**
 * Check if an event is an input request event (created, answered, or declined).
 */
function isInputRequestEvent(event: PlanEvent): event is PlanEvent & {
  type: 'input_request_created' | 'input_request_answered' | 'input_request_declined';
} {
  return (
    event.type === 'input_request_created' ||
    event.type === 'input_request_answered' ||
    event.type === 'input_request_declined'
  );
}

/**
 * Group input request events by request ID for easier formatting.
 */
function groupInputRequestEvents(events: PlanEvent[]): Map<string, InputRequestGroup> {
  const map = new Map<string, InputRequestGroup>();

  for (const event of events) {
    if (!isInputRequestEvent(event)) continue;

    const requestId = event.data.requestId;
    const existing = map.get(requestId) || {};

    if (event.type === 'input_request_created') {
      existing.created = event;
    } else if (event.type === 'input_request_answered') {
      existing.answered = event;
    } else {
      existing.declined = event;
    }

    map.set(requestId, existing);
  }

  return map;
}

/**
 * Format a single input request group to markdown.
 */
function formatInputRequestGroup(requestId: string, group: InputRequestGroup, num: number): string {
  let output = `### ${num}. Input Request\n`;

  if (group.created?.type === 'input_request_created') {
    const created = group.created;
    const message = created.data.requestMessage || '(no message recorded)';
    const inputType = created.data.requestType || 'unknown';
    output += `**Question:** ${message}\n`;
    output += `**Type:** ${inputType}\n`;
    output += `**Request ID:** ${requestId}\n`;
  }

  if (group.answered?.type === 'input_request_answered') {
    const answered = group.answered;
    const response = formatResponseValue(answered.data.response);
    const answeredBy = answered.data.answeredBy || 'Unknown';
    output += `**Status:** ✅ Answered\n`;
    output += `**Answered by:** ${answeredBy}\n`;
    output += `**Response:** ${response}\n`;
  } else if (group.declined) {
    output += `**Status:** ❌ Declined\n`;
  } else {
    output += `**Status:** ⏳ Pending\n`;
  }

  return `${output}\n`;
}

/**
 * Format agent activity events to markdown.
 */
function formatAgentActivities(events: PlanEvent[]): string {
  const agentActivities = events.filter(
    (e): e is PlanEvent & { type: 'agent_activity' } => e.type === 'agent_activity'
  );

  if (agentActivities.length === 0) return '';

  let output = '### Agent Activity\n\n';

  for (const event of agentActivities) {
    const data = event.data;
    const timestamp = new Date(event.timestamp).toISOString();
    output += `- **${data.activityType}** (${timestamp}): `;

    if ('message' in data) {
      output += data.message;
    }
    if ('resolution' in data && data.resolution) {
      output += ` → Resolved: ${data.resolution}`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Format activity events into a markdown section.
 * Focuses on input requests and their responses for visibility.
 *
 * @param events - Plan events from YDOC_KEYS.EVENTS
 * @returns Markdown section with activity details, or empty string if no relevant events
 */
function formatActivitySection(events: PlanEvent[]): string {
  const relevantEvents = events.filter(
    (e) =>
      e.type === 'input_request_created' ||
      e.type === 'input_request_answered' ||
      e.type === 'input_request_declined' ||
      e.type === 'agent_activity'
  );

  if (relevantEvents.length === 0) return '';

  let output = '## Activity & Input Requests\n\n';

  const inputRequestMap = groupInputRequestEvents(relevantEvents);
  let requestNum = 1;
  for (const [requestId, group] of inputRequestMap) {
    output += formatInputRequestGroup(requestId, group, requestNum);
    requestNum++;
  }

  output += formatAgentActivities(relevantEvents);

  return output;
}

/**
 * Format a response value for display in markdown.
 * Handles both simple strings and complex objects (multi-question responses).
 */
function formatResponseValue(response: unknown): string {
  if (response === null || response === undefined) {
    return '(no response)';
  }

  if (typeof response === 'string') {
    return `"${response}"`;
  }

  if (typeof response === 'object') {
    const entries = Object.entries(response);
    if (entries.length === 0) {
      return '(empty response)';
    }

    return entries.map(([key, value]) => `[${key}]: "${String(value)}"`).join(', ');
  }

  return String(response);
}
