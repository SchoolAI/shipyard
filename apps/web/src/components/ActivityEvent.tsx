import type { PlanEvent, PlanEventType } from '@peer-plan/schema';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  FileEdit,
  GitPullRequest,
  Link as LinkIcon,
  MessageSquare,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { formatRelativeTime } from '@/utils/formatters';

interface ActivityEventProps {
  event: PlanEvent;
}

function getEventIcon(type: PlanEventType): ReactNode {
  switch (type) {
    case 'plan_created':
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
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled event type: ${exhaustive}`);
    }
  }
}

function getEventDescription(event: PlanEvent): string {
  switch (event.type) {
    case 'plan_created':
      return 'created the plan';
    case 'status_changed': {
      const from = event.data?.fromStatus ?? 'unknown';
      const to = event.data?.toStatus ?? 'unknown';
      return `changed status from ${from} to ${to}`;
    }
    case 'comment_added':
      return 'added a comment';
    case 'comment_resolved':
      return 'resolved a comment';
    case 'artifact_uploaded':
      return 'uploaded an artifact';
    case 'deliverable_linked':
      return 'linked a deliverable to an artifact';
    case 'pr_linked': {
      const prNumber = event.data?.prNumber;
      return prNumber ? `linked PR #${prNumber}` : 'linked a PR';
    }
    case 'content_edited':
      return 'edited the plan content';
    case 'approved':
      return 'approved the plan';
    case 'changes_requested':
      return 'requested changes';
    case 'completed':
      return 'marked the plan as completed';
    default: {
      const exhaustive: never = event.type;
      throw new Error(`Unhandled event type: ${exhaustive}`);
    }
  }
}

export function ActivityEvent({ event }: ActivityEventProps) {
  const icon = getEventIcon(event.type);
  const description = getEventDescription(event);

  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full bg-surface flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          <span className="font-medium">{event.actor}</span> {description}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatRelativeTime(event.timestamp)}
        </p>
      </div>
    </div>
  );
}
