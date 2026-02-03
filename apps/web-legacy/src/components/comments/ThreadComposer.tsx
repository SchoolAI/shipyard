/**
 * Thread composer component for creating new comment threads.
 * Appears in the gutter when user clicks "Add comment" on a block.
 *
 * Uses HeroUI v3 components.
 */

import { Avatar, Button, Card, TextArea } from "@heroui/react";
import { MessageSquarePlus, Send, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { colorFromString } from "@/utils/color";

interface ThreadComposerProps {
	/** Callback when a new thread is created */
	onSubmit: (body: string) => void;
	/** Callback when composer is closed */
	onCancel: () => void;
	/** Current user ID for display */
	userId: string;
	/** Selected text (if any) */
	selectedText?: string;
	/** Auto focus the textarea */
	autoFocus?: boolean;
}

/**
 * Get initials from a user ID for avatar fallback.
 */
function getInitials(userId: string): string {
	const name = userId.startsWith("local:") ? userId.slice(6) : userId;
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
 * Format a user ID for display.
 */
function formatUserId(userId: string): string {
	if (userId.startsWith("local:")) {
		return userId.slice(6);
	}
	return userId;
}

/**
 * Composer for creating new comment threads.
 */
export function ThreadComposer({
	onSubmit,
	onCancel,
	userId,
	selectedText,
	autoFocus = true,
}: ThreadComposerProps) {
	const [value, setValue] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const displayName = formatUserId(userId);
	const initials = getInitials(userId);
	const color = colorFromString(userId);

	const handleSubmit = useCallback(async () => {
		const trimmedValue = value.trim();
		if (!trimmedValue || isSubmitting) return;

		setIsSubmitting(true);
		try {
			onSubmit(trimmedValue);
			setValue("");
		} finally {
			setIsSubmitting(false);
		}
	}, [value, isSubmitting, onSubmit]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			/** Enter without modifier submits */
			if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				handleSubmit();
			}
			/** Escape cancels */
			if (e.key === "Escape") {
				e.preventDefault();
				onCancel();
			}
		},
		[handleSubmit, onCancel],
	);

	const canSubmit = value.trim().length > 0 && !isSubmitting;

	return (
		<Card className="w-full shadow-lg ring-2 ring-primary" variant="default">
			{/* Selected text preview */}
			{selectedText && (
				<div className="px-3 py-2 bg-primary/5 border-b border-separator">
					<p className="text-xs text-muted-foreground">Commenting on:</p>
					<p className="text-sm text-foreground italic truncate">
						"{selectedText}"
					</p>
				</div>
			)}

			<div className="p-3 space-y-3">
				{/* Header with user info */}
				<div className="flex items-center gap-2">
					<Avatar size="sm">
						<Avatar.Fallback style={{ backgroundColor: color, color: "white" }}>
							{initials}
						</Avatar.Fallback>
					</Avatar>
					<span className="font-medium text-sm text-foreground">
						{displayName}
					</span>
					<div className="flex-1" />
					<Button
						size="sm"
						variant="ghost"
						isIconOnly
						onPress={onCancel}
						aria-label="Cancel comment"
					>
						<X className="w-4 h-4" />
					</Button>
				</div>

				{/* Comment input */}
				<TextArea
					ref={textareaRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Write a comment..."
					aria-label="New comment"
					rows={3}
					className="resize-none text-sm bg-surface-secondary"
					autoFocus={autoFocus}
					disabled={isSubmitting}
				/>

				{/* Actions */}
				<div className="flex justify-between items-center">
					<p className="text-xs text-muted-foreground">
						Enter to send, Shift+Enter for new line
					</p>
					<Button
						size="sm"
						variant="primary"
						onPress={handleSubmit}
						isDisabled={!canSubmit}
						isPending={isSubmitting}
					>
						<Send className="w-4 h-4" />
						Comment
					</Button>
				</div>
			</div>
		</Card>
	);
}

/**
 * Button to trigger opening the thread composer.
 */
interface AddCommentButtonProps {
	onPress: () => void;
	disabled?: boolean;
}

export function AddCommentButton({
	onPress,
	disabled = false,
}: AddCommentButtonProps) {
	return (
		<Button
			size="sm"
			variant="ghost"
			onPress={onPress}
			isDisabled={disabled}
			className="opacity-0 group-hover:opacity-100 transition-opacity"
			aria-label="Add comment"
		>
			<MessageSquarePlus className="w-4 h-4" />
		</Button>
	);
}
