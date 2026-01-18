import { assertNever, type PlanEvent, type PlanEventType } from '@peer-plan/schema';
import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  Check,
  CheckCircle,
  Download,
  FileEdit,
  GitPullRequest,
  HelpCircle,
  Link as LinkIcon,
  MessageSquare,
  RefreshCw,
  Share2,
  Upload,
  X,
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
    case 'conversation_imported':
      return <Download className="w-3.5 h-3.5 text-accent" />;
    case 'conversation_handed_off':
      return <ArrowRightLeft className="w-3.5 h-3.5 text-accent" />;
    case 'step_completed':
      return <CheckCircle className="w-3.5 h-3.5" />;
    case 'plan_archived':
      return <Archive className="w-3.5 h-3.5" />;
    case 'plan_unarchived':
      return <Archive className="w-3.5 h-3.5" />;
    case 'conversation_exported':
      return <Download className="w-3.5 h-3.5" />;
    case 'plan_shared':
      return <Share2 className="w-3.5 h-3.5" />;
    case 'approval_requested':
      return <AlertTriangle className="w-3.5 h-3.5 text-warning" />;
    case 'input_request_created':
      return <HelpCircle className="w-3.5 h-3.5 text-accent" />;
    case 'input_request_answered':
      return <Check className="w-3.5 h-3.5 text-success" />;
    case 'input_request_declined':
      return <X className="w-3.5 h-3.5 text-muted-foreground" />;
    default:
      return assertNever(type);
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Event descriptions require comprehensive switch handling
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
    case 'conversation_imported': {
      const platform = event.data?.sourcePlatform ?? 'unknown';
      const count = event.data?.messageCount ?? 0;
      return `imported conversation from ${platform} (${count} messages)`;
    }
    case 'conversation_handed_off': {
      const handedOffTo = event.data?.handedOffTo ?? 'peer';
      const count = event.data?.messageCount ?? 0;
      return `handed off conversation to ${handedOffTo} (${count} messages)`;
    }
    case 'step_completed': {
      const completed = event.data?.completed ?? true;
      return completed ? 'completed a step' : 'uncompleted a step';
    }
    case 'plan_archived':
      return 'archived the plan';
    case 'plan_unarchived':
      return 'unarchived the plan';
    case 'conversation_exported': {
      const count = event.data?.messageCount ?? 0;
      return `exported conversation (${count} messages)`;
    }
    case 'plan_shared':
      return 'shared the plan';
    case 'approval_requested': {
      const requesterName = event.data?.requesterName;
      return requesterName ? `${requesterName} requested access` : 'requested access to the plan';
    }
    case 'input_request_created': {
      const requestMessage = event.data?.requestMessage;
      const requestType = event.data?.requestType;
      if (requestMessage) {
        return `requested input: "${requestMessage}"`;
      }
      return requestType ? `requested ${requestType} input` : 'requested input';
    }
    case 'input_request_answered': {
      const answeredBy = event.data?.answeredBy;
      const response = event.data?.response;
      if (answeredBy && response !== undefined) {
        // Format response for display
        const responseStr = typeof response === 'string' ? response : JSON.stringify(response);
        const truncated = responseStr.length > 50 ? `${responseStr.slice(0, 50)}...` : responseStr;
        return `${answeredBy} responded: "${truncated}"`;
      }
      return answeredBy ? `${answeredBy} answered input request` : 'answered input request';
    }
    case 'input_request_declined':
      return 'declined input request';
    default:
      return assertNever(event);
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
