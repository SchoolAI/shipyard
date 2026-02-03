import type { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import {
	BasicTextStyleButton,
	BlockTypeSelect,
	CreateLinkButton,
	FormattingToolbar,
	FormattingToolbarController,
	NestBlockButton,
	TextAlignButton,
	UnnestBlockButton,
	useCreateBlockNote,
} from "@blocknote/react";
import { useCallback, useEffect } from "react";
import type { WebrtcProvider } from "y-webrtc";
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";
import { useTheme } from "@/hooks/useTheme";
import { getYUndoExtension } from "@/types/blocknote-extensions";
import { AddCommentToolbarButton } from "./editor/AddCommentToolbarButton";
import { RedoButton } from "./editor/RedoButton";
import { UndoButton } from "./editor/UndoButton";

/** Simple identity type for collaboration cursor display */
interface UserIdentity {
	name: string;
	color: string;
}

/** Provider type that BlockNote can use for collaboration (WebSocket or WebRTC) */
type CollaborationProvider = WebsocketProvider | WebrtcProvider;

interface PlanViewerProps {
	ydoc: Y.Doc;
	/** User identity for collaboration cursors */
	identity: UserIdentity | null;
	/** Provider for collaboration (WebSocket or WebRTC) */
	provider?: CollaborationProvider | null;
	/** Initial content for snapshots (when no provider) */
	initialContent?: unknown[];
	/** Snapshot to view (when viewing version history) - Issue #42 */
	currentSnapshot?: { content: unknown[] } | null;
	/** Callback to receive editor instance for snapshots - Issue #42 */
	onEditorReady?: (editor: BlockNoteEditor) => void;
	/** Callback when user clicks add comment button with block ID and selected text */
	onAddComment?: (blockId: string, selectedText: string) => void;
}

/**
 * Check if Cmd/Ctrl+Z was pressed (platform-aware).
 */
function isCmdOrCtrlZ(e: KeyboardEvent): boolean {
	if (e.key !== "z") return false;
	const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
	return isMac ? e.metaKey : e.ctrlKey;
}

/**
 * Check if target is in an input context where native shortcuts should work.
 */
function isInNativeInputContext(target: HTMLElement): boolean {
	const isInput =
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.isContentEditable;
	return isInput || target.closest(".bn-editor") !== null;
}

export function PlanViewer({
	ydoc,
	identity,
	provider,
	initialContent: _initialContent,
	currentSnapshot = null,
	onEditorReady,
	onAddComment,
}: PlanViewerProps) {
	const { theme } = useTheme();

	/** When viewing a snapshot, use its content and make editor read-only */
	const isViewingHistory = currentSnapshot !== null;
	const effectiveInitialContent = isViewingHistory
		? currentSnapshot.content
		: _initialContent;

	/** Determine effective theme for BlockNote */
	const effectiveTheme: "light" | "dark" = (() => {
		if (theme === "system") {
			return typeof window !== "undefined" &&
				window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		}
		return theme;
	})();

	/** Create editor with all configuration in one place to avoid timing issues. */
	const editor = useCreateBlockNote(
		{
			/**
			 * For snapshots (no provider) OR viewing version history, use initialContent.
			 * BlockNote expects PartialBlock[] but our snapshots store unknown[].
			 * BlockNote handles invalid content gracefully so the cast is safe.
			 */
			initialContent:
				(!provider || isViewingHistory) && effectiveInitialContent
					? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- BlockNote initialContent requires PartialBlock[], casting unknown[] snapshot data
						(effectiveInitialContent as never)
					: undefined,
			/** Disable collaboration when viewing history (read-only snapshot mode) */
			collaboration:
				provider && !isViewingHistory
					? {
							provider,
							/** Use 'document' key - this is the DOCUMENT_FRAGMENT (source of truth) */
							fragment: ydoc.getXmlFragment("document"),
							user: identity
								? {
										name: identity.name,
										color: identity.color,
									}
								: {
										name: "Anonymous",
										color: "hsl(0, 0%, 55%)",
									},
						}
					: undefined,
			/** Make editor read-only when viewing history */
			editable: !isViewingHistory,
		},
		/*
		 * Dependencies: recreate editor when ydoc, theme, or viewing version changes.
		 * This ensures the editor re-renders with the correct theme when toggling dark mode.
		 * Adding currentSnapshot ensures editor recreates when viewing different versions.
		 */
		[ydoc, effectiveTheme, currentSnapshot?.content],
	);

	/*
	 * Force BlockNoteView remount when switching plans, theme, or versions.
	 * Identity changes are handled by the parent's key prop on PlanViewer.
	 * Adding theme to key ensures BlockNote updates immediately without refresh.
	 * Adding snapshot state ensures proper remount when toggling versions.
	 */
	const editorKey = `${ydoc.guid}-${effectiveTheme}-${isViewingHistory ? "history" : "live"}`;

	/** Notify parent when editor is ready (for snapshots - Issue #42) */
	useEffect(() => {
		if (editor && onEditorReady) {
			onEditorReady(editor);
		}
	}, [editor, onEditorReady]);

	/** Global keyboard shortcuts for undo/redo (works even when editor not focused) */
	useEffect(() => {
		if (!editor) return;

		const handleUndoRedoKeyDown = (e: KeyboardEvent) => {
			if (!isCmdOrCtrlZ(e)) return;

			const target = e.target;
			if (!(target instanceof HTMLElement)) return;
			if (isInNativeInputContext(target)) return;

			e.preventDefault();
			editor.focus();

			const yUndo = getYUndoExtension(editor);
			if (!yUndo) return;

			const { state, view } = editor._tiptapEditor;
			const command = e.shiftKey ? yUndo.redoCommand : yUndo.undoCommand;
			command?.(state, view.dispatch, view);
		};

		window.addEventListener("keydown", handleUndoRedoKeyDown);
		return () => window.removeEventListener("keydown", handleUndoRedoKeyDown);
	}, [editor]);

	/**
	 * Memoized formatting toolbar to prevent re-renders on hover.
	 * Without this, the inline function in FormattingToolbarController
	 * would recreate on every render, causing flickering.
	 */
	const renderFormattingToolbar = useCallback(
		() => (
			<FormattingToolbar>
				{/* Undo/Redo - Global operations first */}
				<UndoButton />
				<RedoButton />

				<BlockTypeSelect />

				<BasicTextStyleButton basicTextStyle="bold" />
				<BasicTextStyleButton basicTextStyle="italic" />
				<BasicTextStyleButton basicTextStyle="underline" />
				<BasicTextStyleButton basicTextStyle="strike" />
				<BasicTextStyleButton basicTextStyle="code" />

				<TextAlignButton textAlignment="left" />
				<TextAlignButton textAlignment="center" />
				<TextAlignButton textAlignment="right" />

				<NestBlockButton />
				<UnnestBlockButton />

				<CreateLinkButton />

				{/* Add Comment button - only shows when user is authenticated */}
				<AddCommentToolbarButton onAddComment={onAddComment} />
			</FormattingToolbar>
		),
		[onAddComment],
	);

	return (
		<div className="relative mobile-blocknote bg-surface rounded-lg px-3 md:px-0">
			<BlockNoteView
				key={editorKey}
				editor={editor}
				theme={effectiveTheme}
				editable={!isViewingHistory}
				/** Use custom formatting toolbar */
				formattingToolbar={false}
			>
				{/* Custom formatting toolbar - appears when text is selected */}
				<FormattingToolbarController
					formattingToolbar={renderFormattingToolbar}
				/>
			</BlockNoteView>
		</div>
	);
}
