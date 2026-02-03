import { useBlockNoteEditor, useComponentsContext } from "@blocknote/react";
import { MessageSquarePlus } from "lucide-react";
import { useCallback } from "react";

interface AddCommentToolbarButtonProps {
	/** Callback when add comment is clicked with block ID and selected text */
	onAddComment?: (blockId: string, selectedText: string) => void;
}

/**
 * Add Comment button for BlockNote FormattingToolbar.
 *
 * When clicked, gets the current block ID and selected text,
 * then calls the onAddComment callback to open the composer.
 */
export function AddCommentToolbarButton({
	onAddComment,
}: AddCommentToolbarButtonProps) {
	const editor = useBlockNoteEditor();
	const Components = useComponentsContext();

	const handleClick = useCallback(() => {
		if (!onAddComment) return;

		/** Get the current block containing the cursor */
		const cursorPos = editor.getTextCursorPosition();
		const blockId = cursorPos.block.id;

		/** Get the selected text (may be empty) */
		const selectedText = editor.getSelectedText();

		onAddComment(blockId, selectedText);
	}, [editor, onAddComment]);

	if (!Components) {
		throw new Error(
			"AddCommentToolbarButton must be used within BlockNote context",
		);
	}

	/** Only show button when callback is provided (user is authenticated) */
	if (!onAddComment) {
		return null;
	}

	return (
		<Components.FormattingToolbar.Button
			mainTooltip="Add Comment"
			onClick={handleClick}
		>
			<MessageSquarePlus size={16} />
		</Components.FormattingToolbar.Button>
	);
}
