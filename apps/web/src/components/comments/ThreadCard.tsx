/**
 * Thread card component for the comment gutter.
 * Displays a single thread with all its comments and reply functionality.
 *
 * Uses HeroUI v3 components for styling.
 */

import { Avatar, Button, Card, Checkbox } from "@heroui/react";
import type { Thread, ThreadComment } from "@shipyard/schema";
import { extractTextFromCommentBody } from "@shipyard/schema";
import { ChevronDown, ChevronUp, MessageSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import { colorFromString } from "@/utils/color";
import { formatRelativeTime } from "@/utils/formatters";
import { ReplyForm } from "./ReplyForm";

interface ThreadCardProps {
	/** The thread to display */
	thread: Thread;
	/** Whether the card is currently active/selected */
	isActive?: boolean;
	/** Callback when the card is clicked */
	onClick?: () => void;
	/** Callback to scroll to the associated block */
	onScrollToBlock?: () => void;
	/** Callback when a reply is submitted */
	onReply?: (body: string) => void;
	/** Callback to toggle resolved status */
	onToggleResolved?: () => void;
	/** Callback to delete the thread */
	onDelete?: () => void;
	/** Current user ID for identity display */
	currentUserId?: string;
	/** Whether the user can reply (has identity) */
	canReply?: boolean;
}

/** Props for an individual comment within a thread */
interface CommentItemProps {
	comment: ThreadComment;
	isFirst: boolean;
	isResolved?: boolean;
}

/**
 * Format a user ID for display.
 * Handles local: prefixed IDs and GitHub usernames.
 */
function formatUserId(userId: string): string {
	if (userId.startsWith("local:")) {
		return userId.slice(6);
	}
	/** For Claude Code agent identity */
	if (userId.includes("(")) {
		const parts = userId.split("(");
		return (parts[0] ?? userId).trim();
	}
	return userId;
}

/**
 * Get initials from a user ID for avatar fallback.
 */
function getInitials(userId: string): string {
	const name = formatUserId(userId);
	const parts = name.split(/[\s_-]+/);
	if (parts.length >= 2) {
		const first = parts[0] ?? "";
		const second = parts[1] ?? "";
		const firstChar = first[0];
		const secondChar = second[0];
		if (firstChar && secondChar) {
			return (firstChar + secondChar).toUpperCase();
		}
	}
	return name.slice(0, 2).toUpperCase();
}

/**
 * Individual comment within a thread.
 */
function CommentItem({
	comment,
	isFirst,
	isResolved = false,
}: CommentItemProps) {
	const displayName = formatUserId(comment.userId);
	const initials = getInitials(comment.userId);
	const color = colorFromString(comment.userId);
	const bodyText = extractTextFromCommentBody(comment.body);

	const borderClass = isFirst ? "" : "pt-3 border-t border-separator";
	const nameClass = isResolved ? "text-muted-foreground" : "text-foreground";
	const bodyClass = isResolved
		? "text-muted-foreground line-through"
		: "text-foreground";

	return (
		<div className={`flex gap-3 ${borderClass}`}>
			<Avatar size="sm" className="shrink-0">
				<Avatar.Fallback style={{ backgroundColor: color, color: "white" }}>
					{initials}
				</Avatar.Fallback>
			</Avatar>
			<div className="flex-1 min-w-0">
				<div className="flex items-baseline gap-2 mb-1">
					<span className={`font-medium text-sm truncate ${nameClass}`}>
						{displayName}
					</span>
					<span className="text-xs text-muted-foreground shrink-0">
						{formatRelativeTime(comment.createdAt)}
					</span>
				</div>
				<p className={`text-sm whitespace-pre-wrap break-words ${bodyClass}`}>
					{bodyText}
				</p>
			</div>
		</div>
	);
}

/** Props for the thread header with actions */
interface ThreadHeaderProps {
	selectedText?: string;
	isResolved: boolean;
	onScrollToBlock?: () => void;
	onToggleResolved?: () => void;
	onDelete?: () => void;
}

/**
 * Header section with selected text preview and action buttons.
 */
function ThreadHeader({
	selectedText,
	isResolved,
	onScrollToBlock,
	onToggleResolved,
	onDelete,
}: ThreadHeaderProps) {
	const handleScrollClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onScrollToBlock?.();
	};

	const handleResolveChange = (isSelected: boolean) => {
		if (isSelected !== isResolved) {
			onToggleResolved?.();
		}
	};

	const textClass = isResolved
		? "text-muted-foreground/70"
		: "text-muted-foreground";

	return (
		<div className="flex items-start justify-between px-3 pt-2">
			{selectedText ? (
				<button
					type="button"
					className={`flex-1 text-xs truncate cursor-pointer hover:text-foreground mr-2 text-left ${textClass}`}
					onClick={handleScrollClick}
					title="Click to scroll to this text"
				>
					"{selectedText}"
				</button>
			) : (
				<div className="flex-1" />
			)}

			<div className="flex items-center gap-1 shrink-0">
				{onToggleResolved && (
					<Checkbox
						isSelected={isResolved}
						onChange={handleResolveChange}
						aria-label={isResolved ? "Unresolve thread" : "Resolve thread"}
						className="scale-90"
					>
						<Checkbox.Control className="size-4">
							<Checkbox.Indicator />
						</Checkbox.Control>
					</Checkbox>
				)}

				{onDelete && (
					<Button
						size="sm"
						variant="ghost"
						isIconOnly
						onPress={onDelete}
						aria-label="Delete thread"
						className="w-6 h-6 min-w-0 text-muted-foreground hover:text-danger"
					>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				)}
			</div>
		</div>
	);
}

/** Props for the expanded content section */
interface ExpandedContentProps {
	comments: ThreadComment[];
	isResolved: boolean;
	hasReplies: boolean;
	canReply: boolean;
	showReplyForm: boolean;
	onShowReplyForm: () => void;
	onHideReplyForm: () => void;
	onReply?: (body: string) => void;
	onToggleExpand: () => void;
}

/**
 * Expanded content section with replies and actions.
 */
function ExpandedContent({
	comments,
	isResolved,
	hasReplies,
	canReply,
	showReplyForm,
	onShowReplyForm,
	onHideReplyForm,
	onReply,
	onToggleExpand,
}: ExpandedContentProps) {
	const handleReplySubmit = (body: string) => {
		onReply?.(body);
		onHideReplyForm();
	};

	return (
		<div className="px-3 pb-3 space-y-3">
			{hasReplies && (
				<div className="space-y-3 pl-8">
					{comments.slice(1).map((comment) => (
						<CommentItem
							key={comment.id}
							comment={comment}
							isFirst={false}
							isResolved={isResolved}
						/>
					))}
				</div>
			)}

			<div className="flex items-center justify-end pt-2 border-t border-separator">
				<div className="flex items-center gap-2">
					{canReply && !showReplyForm && (
						<Button size="sm" variant="secondary" onPress={onShowReplyForm}>
							Reply
						</Button>
					)}

					{hasReplies && (
						<Button
							size="sm"
							variant="ghost"
							isIconOnly
							onPress={onToggleExpand}
							aria-label="Collapse replies"
						>
							<ChevronUp className="w-4 h-4" />
						</Button>
					)}
				</div>
			</div>

			{showReplyForm && (
				<ReplyForm
					onSubmit={handleReplySubmit}
					onCancel={onHideReplyForm}
					placeholder="Write a reply..."
				/>
			)}
		</div>
	);
}

/**
 * Thread card for the comment gutter.
 */
export function ThreadCard({
	thread,
	isActive = false,
	onClick,
	onScrollToBlock,
	onReply,
	onToggleResolved,
	onDelete,
	canReply = false,
}: ThreadCardProps) {
	const [isExpanded, setIsExpanded] = useState(isActive);
	const [showReplyForm, setShowReplyForm] = useState(false);

	const firstComment = thread.comments[0];
	const hasReplies = thread.comments.length > 1;
	const replyCount = thread.comments.length - 1;

	const handleCardClick = () => {
		onClick?.();
		if (!isExpanded) {
			setIsExpanded(true);
		}
	};

	if (!firstComment) return null;

	const isResolved = thread.resolved ?? false;
	const cardClass = `w-full transition-all duration-200 ${isActive ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"} ${isResolved ? "opacity-60 bg-muted/30" : ""}`;

	return (
		<Card className={cardClass} variant="default">
			<ThreadHeader
				selectedText={thread.selectedText}
				isResolved={isResolved}
				onScrollToBlock={onScrollToBlock}
				onToggleResolved={onToggleResolved}
				onDelete={onDelete}
			/>

			<button
				type="button"
				className="w-full text-left px-3 pb-3 pt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
				onClick={handleCardClick}
				aria-expanded={isExpanded}
				aria-label={`Comment thread with ${thread.comments.length} comment${thread.comments.length > 1 ? "s" : ""}`}
			>
				<CommentItem
					comment={firstComment}
					isFirst={true}
					isResolved={isResolved}
				/>

				{hasReplies && !isExpanded && (
					<div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
						<MessageSquare className="w-3 h-3" />
						<span>
							{replyCount} {replyCount === 1 ? "reply" : "replies"}
						</span>
						<ChevronDown className="w-3 h-3 ml-auto" />
					</div>
				)}
			</button>

			{isExpanded && (
				<ExpandedContent
					comments={thread.comments}
					isResolved={isResolved}
					hasReplies={hasReplies}
					canReply={canReply}
					showReplyForm={showReplyForm}
					onShowReplyForm={() => setShowReplyForm(true)}
					onHideReplyForm={() => setShowReplyForm(false)}
					onReply={onReply}
					onToggleExpand={() => setIsExpanded(false)}
				/>
			)}
		</Card>
	);
}
