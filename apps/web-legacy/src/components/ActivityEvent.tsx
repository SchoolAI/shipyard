import { Chip } from "@heroui/react";
import {
	type AgentActivityData,
	assertNever,
	type PlanEvent,
} from "@shipyard/schema";
import {
	AlertOctagon,
	AlertTriangle,
	Archive,
	ArrowRightLeft,
	Check,
	CheckCircle,
	Circle,
	Download,
	FileEdit,
	FileText,
	GitPullRequest,
	HelpCircle,
	Key,
	Link as LinkIcon,
	MessageSquare,
	RefreshCw,
	Share2,
	Upload,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { formatRelativeTime } from "@/utils/formatters";

interface ActivityEventProps {
	event: PlanEvent;
	/** Whether this is an unresolved input_request that needs attention */
	isUnresolved?: boolean;
}

/**
 * Get icon for agent activity events based on activity type.
 * Currently only supports the 'update' type.
 */
function getAgentActivityIcon(data: AgentActivityData): ReactNode {
	switch (data.activityType) {
		case "update":
			return <FileText className="w-4 h-4 text-accent" />;
		default: {
			const _exhaustive: never = data.activityType;
			void _exhaustive;
			return <Circle className="w-4 h-4" />;
		}
	}
}

/**
 * Get human-readable description for agent activity events.
 * Returns ReactNode to support markdown rendering in messages.
 */
function getAgentActivityDescription(data: AgentActivityData): ReactNode {
	switch (data.activityType) {
		case "update":
			return (
				<MarkdownContent
					content={data.message}
					variant="compact"
					className="inline"
				/>
			);
		default: {
			const _exhaustive: never = data.activityType;
			void _exhaustive;
			return "agent activity";
		}
	}
}

function getEventIcon(event: PlanEvent): ReactNode {
	switch (event.type) {
		case "plan_created":
			return <FileEdit className="w-3.5 h-3.5" />;
		case "status_changed":
			return <RefreshCw className="w-3.5 h-3.5" />;
		case "comment_added":
			return <MessageSquare className="w-3.5 h-3.5" />;
		case "comment_resolved":
			return <Check className="w-3.5 h-3.5" />;
		case "artifact_uploaded":
			return <Upload className="w-3.5 h-3.5 text-accent" />;
		case "deliverable_linked":
			return <LinkIcon className="w-3.5 h-3.5" />;
		case "pr_linked":
			return <GitPullRequest className="w-3.5 h-3.5" />;
		case "content_edited":
			return <FileEdit className="w-3.5 h-3.5" />;
		case "approved":
			return <Check className="w-3.5 h-3.5 text-success" />;
		case "changes_requested":
			return <AlertTriangle className="w-3.5 h-3.5 text-danger" />;
		case "completed":
			return <CheckCircle className="w-3.5 h-3.5 text-success" />;
		case "conversation_imported":
			return <Download className="w-3.5 h-3.5 text-accent" />;
		case "conversation_handed_off":
			return <ArrowRightLeft className="w-3.5 h-3.5 text-accent" />;
		case "step_completed":
			return <CheckCircle className="w-3.5 h-3.5" />;
		case "plan_archived":
			return <Archive className="w-3.5 h-3.5" />;
		case "plan_unarchived":
			return <Archive className="w-3.5 h-3.5" />;
		case "conversation_exported":
			return <Download className="w-3.5 h-3.5" />;
		case "plan_shared":
			return <Share2 className="w-3.5 h-3.5" />;
		case "approval_requested":
			return <AlertTriangle className="w-3.5 h-3.5 text-warning" />;
		case "input_request_created": {
			const isBlocker = event.data?.isBlocker;
			return isBlocker ? (
				<AlertOctagon className="w-3.5 h-3.5 text-danger" />
			) : (
				<HelpCircle className="w-3.5 h-3.5 text-accent" />
			);
		}
		case "input_request_answered":
			return <Check className="w-3.5 h-3.5 text-success" />;
		case "input_request_declined":
			return <X className="w-3.5 h-3.5 text-muted-foreground" />;
		case "agent_activity":
			/** agent_activity uses special helper - will be called separately */
			return <Circle className="w-3.5 h-3.5" />;
		case "session_token_regenerated":
			return <Key className="w-3.5 h-3.5 text-warning" />;
		default: {
			const _exhaustive: never = event;
			return assertNever(_exhaustive);
		}
	}
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Event descriptions require comprehensive switch handling
function getEventDescription(event: PlanEvent): ReactNode {
	switch (event.type) {
		case "plan_created":
			return "created the task";
		case "status_changed": {
			const from = event.data?.fromStatus ?? "unknown";
			const to = event.data?.toStatus ?? "unknown";
			return `changed status from ${from} to ${to}`;
		}
		case "comment_added":
			return "added a comment";
		case "comment_resolved":
			return "resolved a comment";
		case "artifact_uploaded":
			return "uploaded an artifact";
		case "deliverable_linked":
			return "linked a deliverable to an artifact";
		case "pr_linked": {
			const prNumber = event.data?.prNumber;
			return prNumber ? `linked PR #${prNumber}` : "linked a PR";
		}
		case "content_edited":
			return "edited the task content";
		case "approved": {
			const approveComment = event.data?.comment;
			return approveComment ? (
				<>
					approved the task:{" "}
					<MarkdownContent
						content={approveComment}
						variant="compact"
						className="inline"
					/>
				</>
			) : (
				"approved the task"
			);
		}
		case "changes_requested": {
			const changesComment = event.data?.comment;
			return changesComment ? (
				<>
					requested changes:{" "}
					<MarkdownContent
						content={changesComment}
						variant="compact"
						className="inline"
					/>
				</>
			) : (
				"requested changes"
			);
		}
		case "completed":
			return "marked the task as completed";
		case "conversation_imported": {
			const platform = event.data?.sourcePlatform ?? "unknown";
			const count = event.data?.messageCount ?? 0;
			return `imported conversation from ${platform} (${count} messages)`;
		}
		case "conversation_handed_off": {
			const handedOffTo = event.data?.handedOffTo ?? "peer";
			const count = event.data?.messageCount ?? 0;
			return `handed off conversation to ${handedOffTo} (${count} messages)`;
		}
		case "step_completed": {
			const completed = event.data?.completed ?? true;
			return completed ? "completed a step" : "uncompleted a step";
		}
		case "plan_archived":
			return "archived the task";
		case "plan_unarchived":
			return "unarchived the task";
		case "conversation_exported": {
			const count = event.data?.messageCount ?? 0;
			return `exported conversation (${count} messages)`;
		}
		case "plan_shared":
			return "shared the task";
		case "approval_requested": {
			const requesterName = event.data?.requesterName;
			return requesterName
				? `${requesterName} requested access`
				: "requested access to the task";
		}
		case "input_request_created": {
			const requestMessage = event.data?.requestMessage;
			const requestType = event.data?.requestType;
			const isBlocker = event.data?.isBlocker;
			const prefix = isBlocker ? "BLOCKED - needs" : "requested";
			const blockerBadge = isBlocker ? (
				<Chip color="danger" variant="primary" size="sm" className="ml-1">
					BLOCKER
				</Chip>
			) : null;
			if (requestMessage) {
				return (
					<>
						{prefix} input:{" "}
						<MarkdownContent
							content={requestMessage}
							variant="compact"
							className="inline"
						/>
						{blockerBadge}
					</>
				);
			}
			return (
				<>
					{requestType ? `${prefix} ${requestType} input` : `${prefix} input`}
					{blockerBadge}
				</>
			);
		}
		case "input_request_answered": {
			const answeredBy = event.data?.answeredBy;
			const response = event.data?.response;
			const requestMessage = event.data?.requestMessage;
			const requestType = event.data?.requestType;

			/** Format response for display */
			const formatResponse = (resp: unknown): string => {
				if (typeof resp === "string") return resp;
				if (typeof resp === "object" && resp !== null) {
					/** For multi-question responses, show count */
					const entries = Object.entries(resp);
					if (entries.length > 1) {
						return `${entries.length} answers`;
					}
				}
				return JSON.stringify(resp);
			};

			if (answeredBy && response !== undefined) {
				const responseStr = formatResponse(response);
				const truncatedResponse =
					responseStr.length > 40
						? `${responseStr.slice(0, 40)}...`
						: responseStr;

				if (requestMessage) {
					/** Show both question and answer */
					const truncatedQuestion =
						requestMessage.length > 40
							? `${requestMessage.slice(0, 40)}...`
							: requestMessage;
					return (
						<>
							answered {requestType === "multi" ? "form" : "question"}: "
							<MarkdownContent
								content={truncatedQuestion}
								variant="compact"
								className="inline"
							/>
							" with "{truncatedResponse}"
						</>
					);
				}

				return `${answeredBy} responded: "${truncatedResponse}"`;
			}
			return answeredBy
				? `${answeredBy} answered input request`
				: "answered input request";
		}
		case "input_request_declined":
			return "declined input request";
		case "agent_activity":
			/** agent_activity uses special helper with sub-type logic */
			return getAgentActivityDescription(event.data);
		case "session_token_regenerated":
			return "regenerated the session token";
		default:
			return assertNever(event);
	}
}

/**
 * Determine the highlight color for unresolved events.
 * Input request blockers use danger (red), others use warning (yellow).
 */
function getUnresolvedHighlightColor(event: PlanEvent): "danger" | "warning" {
	/** Input request blockers use danger */
	if (event.type === "input_request_created") {
		return event.data?.isBlocker ? "danger" : "warning";
	}

	return "warning";
}

/**
 * Get the appropriate label for unresolved events.
 * Input requests show "Waiting for Response", others show "Needs Resolution".
 */
function getUnresolvedLabel(event: PlanEvent): string {
	if (event.type === "input_request_created") {
		return "Waiting for Response";
	}
	return "Needs Resolution";
}

export function ActivityEvent({
	event,
	isUnresolved = false,
}: ActivityEventProps) {
	/** Use special icon helper for agent_activity events */
	const icon =
		event.type === "agent_activity"
			? getAgentActivityIcon(event.data)
			: getEventIcon(event);
	const description = getEventDescription(event);

	/** Determine styling based on unresolved status */
	const highlightColor = isUnresolved
		? getUnresolvedHighlightColor(event)
		: null;
	const borderClass = highlightColor
		? highlightColor === "danger"
			? "border-l-2 border-danger pl-3"
			: "border-l-2 border-warning pl-3"
		: "";

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
						<Chip
							color={highlightColor ?? "warning"}
							variant="soft"
							className="text-xs py-0"
						>
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
