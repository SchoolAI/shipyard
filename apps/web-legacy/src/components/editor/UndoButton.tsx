import { useBlockNoteEditor, useComponentsContext } from "@blocknote/react";
import { Undo } from "lucide-react";
import { getYUndoExtension } from "@/types/blocknote-extensions";

/**
 * Undo button for BlockNote FormattingToolbar.
 * Uses BlockNote's built-in undo functionality via Tiptap.
 */
export function UndoButton() {
	const editor = useBlockNoteEditor();
	const Components = useComponentsContext();

	if (!Components) {
		throw new Error("UndoButton must be used within BlockNote context");
	}

	return (
		<Components.FormattingToolbar.Button
			mainTooltip="Undo (Cmd+Z)"
			onClick={() => {
				editor.focus();

				/** Get the yUndo extension (used when collaboration is enabled) */
				const yUndo = getYUndoExtension(editor);
				if (yUndo?.undoCommand) {
					const { state, view } = editor._tiptapEditor;
					yUndo.undoCommand(state, view.dispatch, view);
				}
			}}
		>
			<Undo size={16} />
		</Components.FormattingToolbar.Button>
	);
}
