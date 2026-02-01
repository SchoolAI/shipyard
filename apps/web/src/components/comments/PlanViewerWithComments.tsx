/**
 * Plan viewer wrapper that includes the comment gutter alongside the editor.
 *
 * This component combines:
 * - PlanViewer (BlockNote editor)
 * - CommentGutter (side panel with comment threads)
 * - Block position tracking for aligning comments
 *
 * Desktop-only for the gutter. Mobile uses a different approach (future).
 */

import type { BlockNoteEditor } from "@blocknote/core";
import { useCallback, useRef, useState } from "react";
import type { WebrtcProvider } from "y-webrtc";
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";
import { PlanViewer } from "@/components/PlanViewer";
import { useBlockPositions } from "@/hooks/useBlockPositions";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { OpenComposerData } from "./CommentGutter";
import { CommentGutter } from "./CommentGutter";

/** Simple identity type for display purposes */
interface UserIdentity {
	id: string;
	name: string;
	color: string;
}

/** Provider type that BlockNote can use for collaboration */
type CollaborationProvider = WebsocketProvider | WebrtcProvider;

interface PlanViewerWithCommentsProps {
	/** The Y.Doc containing plan data and threads */
	ydoc: Y.Doc;
	/** User identity for comments */
	identity: UserIdentity | null;
	/** Provider for collaboration */
	provider?: CollaborationProvider | null;
	/** Called when user needs to authenticate for commenting */
	onRequestIdentity?: () => void;
	/** Initial content for snapshots */
	initialContent?: unknown[];
	/** Snapshot to view (when viewing version history) */
	currentSnapshot?: { content: unknown[] } | null;
	/** Callback to receive editor instance */
	onEditorReady?: (editor: BlockNoteEditor) => void;
	/** Whether to show the comment gutter (default: true on desktop) */
	showCommentGutter?: boolean;
}

/**
 * Plan viewer with integrated comment gutter.
 *
 * The layout is:
 * - Desktop: [Editor] [Gutter]
 * - Mobile: [Editor] (gutter not shown - future: bottom sheet)
 */
export function PlanViewerWithComments({
	ydoc,
	identity,
	provider,
	onRequestIdentity: _onRequestIdentity,
	initialContent,
	currentSnapshot,
	onEditorReady,
	showCommentGutter = true,
}: PlanViewerWithCommentsProps) {
	/**
	 * Note: _onRequestIdentity is available for future use when adding
	 * a sign-in prompt to the comment gutter for anonymous users.
	 */
	const isMobile = useIsMobile();
	const editorRef = useRef<BlockNoteEditor | null>(null);

	/** Track block positions for aligning comments */
	const { positions, containerRef, isReady } = useBlockPositions();

	/** State for opening composer from toolbar button */
	const [openComposerRequest, setOpenComposerRequest] =
		useState<OpenComposerData | null>(null);

	/** Handle editor ready - forward to parent and store ref */
	const handleEditorReady = useCallback(
		(editor: BlockNoteEditor) => {
			editorRef.current = editor;
			onEditorReady?.(editor);
		},
		[onEditorReady],
	);

	/** Scroll to a specific block in the editor */
	const handleScrollToBlock = useCallback(
		(blockId: string) => {
			const position = positions.get(blockId);
			if (position?.element) {
				position.element.scrollIntoView({
					behavior: "smooth",
					block: "center",
				});

				/** Briefly highlight the block */
				position.element.classList.add(
					"ring-2",
					"ring-primary",
					"ring-opacity-50",
				);
				setTimeout(() => {
					position.element?.classList.remove(
						"ring-2",
						"ring-primary",
						"ring-opacity-50",
					);
				}, 2000);
			}
		},
		[positions],
	);

	/** Handle add comment from toolbar button */
	const handleAddComment = useCallback(
		(blockId: string, selectedText: string) => {
			/** Only allow if user is authenticated and gutter is showing */
			if (!identity) return;

			setOpenComposerRequest({
				blockId,
				selectedText: selectedText || undefined,
			});
		},
		[identity],
	);

	/** Handle composer state change - clear request when composer closes */
	const handleComposerStateChange = useCallback((isOpen: boolean) => {
		if (!isOpen) {
			setOpenComposerRequest(null);
		}
	}, []);

	/** Determine if we should show the gutter */
	const shouldShowGutter = showCommentGutter && !isMobile && identity !== null;

	/** Get user ID for comment identity */
	const userId = identity?.id ?? null;

	/** Mobile: no panels, just the editor */
	if (isMobile) {
		return (
			<div ref={containerRef}>
				<PlanViewer
					key={identity?.name ?? "anonymous"}
					ydoc={ydoc}
					identity={identity}
					provider={provider}
					initialContent={initialContent}
					currentSnapshot={currentSnapshot}
					onEditorReady={handleEditorReady}
					onAddComment={undefined}
				/>
			</div>
		);
	}

	return (
		<div ref={containerRef} className="relative">
			<PlanViewer
				key={identity?.name ?? "anonymous"}
				ydoc={ydoc}
				identity={identity}
				provider={provider}
				initialContent={initialContent}
				currentSnapshot={currentSnapshot}
				onEditorReady={handleEditorReady}
				onAddComment={shouldShowGutter ? handleAddComment : undefined}
			/>

			{shouldShowGutter && isReady && (
				<div className="absolute top-0 left-full w-80 ml-4">
					<CommentGutter
						ydoc={ydoc}
						blockPositions={positions}
						userId={userId}
						onScrollToBlock={handleScrollToBlock}
						isVisible={true}
						width={320}
						openComposerRequest={openComposerRequest}
						onComposerStateChange={handleComposerStateChange}
					/>
				</div>
			)}
		</div>
	);
}
