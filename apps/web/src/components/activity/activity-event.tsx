import { Chip } from '@heroui/react';
import type { TaskEventItem } from '@shipyard/loro-schema';
import {
  AlertOctagon,
  AlertTriangle,
  Archive,
  Check,
  CheckCircle,
  Circle,
  FileEdit,
  FileText,
  GitPullRequest,
  HelpCircle,
  Link as LinkIcon,
  MessageSquare,
  Play,
  RefreshCw,
  Rocket,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { MarkdownContent } from '@/components/ui/markdown-content';
import { formatRelativeTime } from '@/utils/formatters';

interface ActivityEventProps {
  event: TaskEventItem;
  isUnresolved?: boolean;
}

function getEventIcon(event: TaskEventItem): ReactNode {
  switch (event.type) {
    case 'task_created':
      return <FileEdit className="w-3.5 h-3.5" />;
    case 'status_changed':
      return <RefreshCw className="w-3.5 h-3.5" />;
    case 'comment_added':
      return <MessageSquare className="w-3.5 h-3.5" />;
    case 'comment_resolved':
      return <Check className="w-3.5 h-3.5" />;
    case 'artifact_uploaded':
      return <Upload className="w-3.5 h-3.5 text-accent" />;
    case 'deliverable_linked':
      return <LinkIcon className="w-3.5 h-3.5" />;
    case 'pr_linked':
      return <GitPullRequest className="w-3.5 h-3.5" />;
    case 'content_edited':
      return <FileEdit className="w-3.5 h-3.5" />;
    case 'approved':
      return <Check className="w-3.5 h-3.5 text-success" />;
    case 'changes_requested':
      return <AlertTriangle className="w-3.5 h-3.5 text-danger" />;
    case 'completed':
      return <CheckCircle className="w-3.5 h-3.5 text-success" />;
    case 'task_archived':
      return <Archive className="w-3.5 h-3.5" />;
    case 'task_unarchived':
      return <Archive className="w-3.5 h-3.5" />;
    case 'input_request_created': {
      const isBlocker = event.isBlocker;
      return isBlocker ? (
        <AlertOctagon className="w-3.5 h-3.5 text-danger" />
      ) : (
        <HelpCircle className="w-3.5 h-3.5 text-accent" />
      );
    }
    case 'input_request_answered':
      return <Check className="w-3.5 h-3.5 text-success" />;
    case 'input_request_declined':
      return <X className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'input_request_cancelled':
      return <X className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'agent_activity':
      return <FileText className="w-3.5 h-3.5 text-accent" />;
    case 'title_changed':
      return <FileEdit className="w-3.5 h-3.5" />;
    case 'spawn_requested':
      return <Rocket className="w-3.5 h-3.5 text-accent" />;
    case 'spawn_started':
      return <Play className="w-3.5 h-3.5 text-success" />;
    case 'spawn_completed':
      return <CheckCircle className="w-3.5 h-3.5 text-success" />;
    case 'spawn_failed':
      return <XCircle className="w-3.5 h-3.5 text-danger" />;
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return <Circle className="w-3.5 h-3.5" />;
    }
  }
}

function renderMessageWithMarkdown(
  prefix: string,
  message: string | null | undefined,
  fallback: string
): ReactNode {
  if (!message) return fallback;
  return (
    <>
      {prefix}: <MarkdownContent content={message} variant="compact" className="inline" />
    </>
  );
}

function renderInputRequestDescription(
  event: Extract<TaskEventItem, { type: 'input_request_created' }>
): ReactNode {
  const prefix = event.isBlocker ? 'BLOCKED - needs' : 'requested';
  const blockerBadge = event.isBlocker ? (
    <Chip color="danger" variant="primary" size="sm" className="ml-1">
      BLOCKER
    </Chip>
  ) : null;
  return (
    <>
      {prefix} input:{' '}
      <MarkdownContent content={event.message} variant="compact" className="inline" />
      {blockerBadge}
    </>
  );
}

function truncatePrompt(prompt: string): string {
  const MAX_LENGTH = 50;
  return prompt.length > MAX_LENGTH ? `${prompt.slice(0, MAX_LENGTH)}...` : prompt;
}

const SIMPLE_EVENT_DESCRIPTIONS: Partial<Record<TaskEventItem['type'], string>> = {
  task_created: 'created the task',
  comment_added: 'added a comment',
  comment_resolved: 'resolved a comment',
  completed: 'marked the task as completed',
  task_archived: 'archived the task',
  task_unarchived: 'unarchived the task',
  input_request_answered: 'answered input request',
  input_request_declined: 'declined input request',
  input_request_cancelled: 'cancelled input request',
};

type EventDescriptionHandler<T extends TaskEventItem> = (event: T) => ReactNode;

const EVENT_DESCRIPTION_HANDLERS: {
  [K in TaskEventItem['type']]?: EventDescriptionHandler<Extract<TaskEventItem, { type: K }>>;
} = {
  status_changed: (event) => `changed status from ${event.fromStatus} to ${event.toStatus}`,
  artifact_uploaded: (event) => `uploaded ${event.filename}`,
  deliverable_linked: (event) =>
    event.deliverableText
      ? `linked deliverable: ${event.deliverableText}`
      : 'linked a deliverable to an artifact',
  pr_linked: (event) =>
    event.title ? `linked PR #${event.prNumber}: ${event.title}` : `linked PR #${event.prNumber}`,
  content_edited: (event) =>
    event.summary ? `edited content: ${event.summary}` : 'edited the task content',
  approved: (event) =>
    renderMessageWithMarkdown('approved the task', event.message, 'approved the task'),
  changes_requested: (event) =>
    renderMessageWithMarkdown('requested changes', event.message, 'requested changes'),
  input_request_created: renderInputRequestDescription,
  agent_activity: (event) => (
    <MarkdownContent content={event.message} variant="compact" className="inline" />
  ),
  title_changed: (event) => `changed title from "${event.fromTitle}" to "${event.toTitle}"`,
  spawn_requested: (event) => `requested agent spawn: ${truncatePrompt(event.prompt)}`,
  spawn_started: (event) => `agent started (PID: ${event.pid})`,
  spawn_completed: (event) => `agent completed (exit code: ${event.exitCode})`,
  spawn_failed: (event) => `agent spawn failed: ${event.error}`,
};

function getEventDescription(event: TaskEventItem): ReactNode {
  const simpleDescription = SIMPLE_EVENT_DESCRIPTIONS[event.type];
  if (simpleDescription) return simpleDescription;

  const handler = EVENT_DESCRIPTION_HANDLERS[event.type] as
    | EventDescriptionHandler<typeof event>
    | undefined;
  if (handler) return handler(event);

  return 'unknown event';
}

function getUnresolvedHighlightColor(event: TaskEventItem): 'danger' | 'warning' {
  if (event.type === 'input_request_created') {
    return event.isBlocker ? 'danger' : 'warning';
  }
  return 'warning';
}

function getUnresolvedLabel(event: TaskEventItem): string {
  if (event.type === 'input_request_created') {
    return 'Waiting for Response';
  }
  return 'Needs Resolution';
}

export function ActivityEvent({ event, isUnresolved = false }: ActivityEventProps) {
  const icon = getEventIcon(event);
  const description = getEventDescription(event);

  const highlightColor = isUnresolved ? getUnresolvedHighlightColor(event) : null;
  const borderClass = highlightColor
    ? highlightColor === 'danger'
      ? 'border-l-2 border-danger pl-3'
      : 'border-l-2 border-warning pl-3'
    : '';

  return (
    <div className={`flex gap-3 items-start ${borderClass}`}>
      <div className="w-6 h-6 rounded-full bg-surface flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-foreground">
            <span className="font-medium">{event.actor}</span> {description}
          </p>
          {isUnresolved && (
            <Chip color={highlightColor ?? 'warning'} variant="soft" className="text-xs py-0">
              {getUnresolvedLabel(event)}
            </Chip>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatRelativeTime(event.timestamp)}
        </p>
      </div>
    </div>
  );
}
