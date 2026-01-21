import type { BlockNoteEditor } from '@blocknote/core';
import {
  CommentsExtension,
  DefaultThreadStoreAuth,
  YjsThreadStore,
} from '@blocknote/core/comments';
import { BlockNoteView } from '@blocknote/mantine';
import {
  AddCommentButton,
  BasicTextStyleButton,
  BlockTypeSelect,
  CreateLinkButton,
  FloatingComposerController,
  FloatingThreadController,
  FormattingToolbar,
  FormattingToolbarController,
  NestBlockButton,
  TextAlignButton,
  UnnestBlockButton,
  useCreateBlockNote,
} from '@blocknote/react';
import { Alert, Button } from '@heroui/react';
import type { Thread } from '@shipyard/schema';
import { YDOC_KEYS } from '@shipyard/schema';
import { User } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { useUserIdentity } from '@/contexts/UserIdentityContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useTheme } from '@/hooks/useTheme';
import { RedoButton } from './editor/RedoButton';
import { UndoButton } from './editor/UndoButton';

/** Simple identity type for display purposes */
interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

/** Provider type that BlockNote can use for collaboration (WebSocket or WebRTC) */
type CollaborationProvider = WebsocketProvider | WebrtcProvider;

interface PlanViewerProps {
  ydoc: Y.Doc;
  /** User identity for comments */
  identity: UserIdentity | null;
  /** Provider for collaboration (WebSocket or WebRTC) */
  provider?: CollaborationProvider | null;
  /** Called when user needs to set up identity for commenting */
  onRequestIdentity?: () => void;
  /** Initial content for snapshots (when no provider) */
  initialContent?: unknown[];
  /** Snapshot to view (when viewing version history) - Issue #42 */
  currentSnapshot?: { content: unknown[] } | null;
  /** Callback to receive editor instance for snapshots - Issue #42 */
  onEditorReady?: (editor: BlockNoteEditor) => void;
}

/**
 * Convert HSL to RGB using standard color space conversion.
 * Formula from CSS Color Module Level 3 spec.
 * h: 0-360, s: 0-100, l: 0-100
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Convert any color format to normalized hex for comparison.
 * Handles: #hex, rgb(r,g,b), rgba(r,g,b,a), hsl(h, s%, l%)
 */
function normalizeColor(color: string): string {
  if (!color) return '';

  // Already hex
  if (color.startsWith('#')) {
    return color.toLowerCase();
  }

  // HSL/HSLA format: hsl(180, 70%, 50%) or hsla(180, 70%, 50%, 1)
  const hslMatch = color.match(/hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?/i);
  if (hslMatch?.[1] && hslMatch[2] && hslMatch[3]) {
    const h = Number.parseInt(hslMatch[1], 10);
    const s = Number.parseInt(hslMatch[2], 10);
    const l = Number.parseInt(hslMatch[3], 10);
    const [r, g, b] = hslToRgb(h, s, l);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // RGB/RGBA format
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch?.[1] && rgbMatch[2] && rgbMatch[3]) {
    const r = Number.parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
    const g = Number.parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
    const b = Number.parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  return color.toLowerCase();
}

/**
 * Create a resolveUsers function that looks up user info from the ydoc.
 * Users are stored in a 'users' map when they set up their profile.
 */
function createResolveUsers(ydoc: Y.Doc, currentIdentity: UserIdentity | null) {
  return async (
    userIds: string[]
  ): Promise<Array<{ id: string; username: string; avatarUrl: string }>> => {
    const usersMap = ydoc.getMap<{ displayName: string; color: string }>('users');

    return userIds.map((id) => {
      // Check if this is the current user
      if (currentIdentity && id === currentIdentity.id) {
        return {
          id,
          username: currentIdentity.name,
          avatarUrl: '',
        };
      }

      // Look up from ydoc users map
      const userData = usersMap.get(id);
      if (userData) {
        return {
          id,
          username: userData.displayName,
          avatarUrl: '',
        };
      }

      // Fallback to ID slice
      return {
        id,
        username: id.slice(0, 8),
        avatarUrl: '',
      };
    });
  };
}

export function PlanViewer({
  ydoc,
  identity,
  provider,
  onRequestIdentity,
  initialContent: _initialContent,
  currentSnapshot = null,
  onEditorReady,
}: PlanViewerProps) {
  // Comments are fully enabled only when identity is set
  const hasComments = identity !== null;
  const { theme } = useTheme();
  const { startAuth } = useGitHubAuth();

  // When viewing a snapshot, use its content and make editor read-only
  const isViewingHistory = currentSnapshot !== null;
  const effectiveInitialContent = isViewingHistory ? currentSnapshot.content : _initialContent;

  // Determine effective theme for BlockNote
  const effectiveTheme: 'light' | 'dark' = (() => {
    if (theme === 'system') {
      return typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return theme;
  })();

  // Store current user info in ydoc so other peers can resolve their name
  useEffect(() => {
    if (!identity) return;
    const usersMap = ydoc.getMap<{ displayName: string; color: string }>('users');
    usersMap.set(identity.id, {
      displayName: identity.name,
      color: identity.color,
    });
  }, [ydoc, identity]);

  // Create editor with all configuration in one place to avoid timing issues.
  // When identity is null, we don't enable comments at all.
  // When identity is set, we create the threadStore and extension inline.
  const editor = useCreateBlockNote(
    {
      // When viewing history, use snapshot content in read-only mode
      // When collaboration is enabled, content comes from the Yjs fragment.
      // For snapshots (no provider) OR viewing version history, use initialContent.
      initialContent:
        (!provider || isViewingHistory) && effectiveInitialContent
          ? (effectiveInitialContent as never)
          : undefined,
      // Disable collaboration when viewing history (read-only snapshot mode)
      collaboration:
        provider && !isViewingHistory
          ? {
              provider,
              // Use 'document' key - this is the DOCUMENT_FRAGMENT (source of truth)
              fragment: ydoc.getXmlFragment('document'),
              user: identity
                ? {
                    name: identity.name,
                    color: identity.color,
                  }
                : {
                    name: 'Anonymous',
                    color: 'hsl(0, 0%, 55%)', // Neutral gray works in light and dark modes
                  },
            }
          : undefined,
      // Make editor read-only when viewing history
      editable: !isViewingHistory,
      // ALWAYS load CommentsExtension to properly render comment marks in the document.
      // Without this, documents with comment marks will render incorrectly when
      // identity is null (e.g., after clearing browser data).
      // When identity is null, we use 'anonymous' as userId with 'comment' role (read-only).
      extensions: [
        CommentsExtension({
          threadStore: new YjsThreadStore(
            identity?.id ?? 'anonymous-viewer',
            ydoc.getMap<Record<string, Thread>>(YDOC_KEYS.THREADS),
            new DefaultThreadStoreAuth(
              identity?.id ?? 'anonymous-viewer',
              identity ? 'editor' : 'comment'
            )
          ),
          resolveUsers: createResolveUsers(ydoc, identity),
        }),
      ],
    },
    // Dependencies: recreate editor when ydoc, identity, theme, or viewing version changes.
    // This ensures the extension is properly registered when identity becomes available,
    // and the editor re-renders with the correct theme when toggling dark mode.
    // Adding currentSnapshot ensures editor recreates when viewing different versions.
    [ydoc, identity?.id, effectiveTheme, currentSnapshot?.content]
  );

  // Force BlockNoteView remount when switching plans, theme, or versions.
  // Identity changes are handled by the parent's key prop on PlanViewer.
  // Adding theme to key ensures BlockNote updates immediately without refresh.
  // Adding snapshot state ensures proper remount when toggling versions.
  const editorKey = `${ydoc.guid}-${effectiveTheme}-${isViewingHistory ? 'history' : 'live'}`;

  // Ref for the container to observe cursor elements
  const containerRef = useRef<HTMLDivElement>(null);

  // Mark own collaboration cursors so CSS can hide them
  // This uses MutationObserver to detect cursor elements and marks ones matching our color
  useEffect(() => {
    if (!identity || !containerRef.current) return;

    // Normalize our color to hex for consistent comparison
    const ownColorNormalized = normalizeColor(identity.color);

    const markOwnCursors = () => {
      const cursors = containerRef.current?.querySelectorAll('.bn-collaboration-cursor__caret');
      cursors?.forEach((cursor) => {
        const cursorColor = (cursor as HTMLElement).style.backgroundColor;
        const cursorColorNormalized = normalizeColor(cursorColor);
        const parent = cursor.closest('.bn-collaboration-cursor__base');
        if (parent) {
          // Check if this cursor's color matches our color (both normalized to hex)
          const isOwn = cursorColorNormalized === ownColorNormalized;
          (parent as HTMLElement).setAttribute('data-is-own-cursor', isOwn ? 'true' : 'false');
        }
      });
    };

    // Initial mark
    markOwnCursors();

    // Observe for new cursor elements
    const observer = new MutationObserver(markOwnCursors);
    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => observer.disconnect();
  }, [identity]);

  // Auto-focus comment input when FloatingComposer appears
  useEffect(() => {
    if (!hasComments || !containerRef.current) return;

    const focusCommentInput = () => {
      // BlockNote's FloatingComposer uses a mini BlockNote editor (CommentEditor)
      // which renders as a ProseMirror contenteditable div
      const selectors = [
        // ProseMirror editor inside floating composer
        '.bn-thread .ProseMirror[contenteditable="true"]',
        // Fallback: any contenteditable in the thread
        '.bn-thread [contenteditable="true"]',
        // Generic BlockNote editor in thread
        '.bn-thread .bn-editor',
      ];

      for (const selector of selectors) {
        const input = containerRef.current?.querySelector(selector);
        if (input instanceof HTMLElement) {
          // Small delay to ensure the composer is fully rendered and ready
          setTimeout(() => {
            input.focus();
            // For ProseMirror, we may need to trigger a selection
            const selection = window.getSelection();
            if (selection && input.firstChild) {
              selection.selectAllChildren(input);
              selection.collapseToEnd();
            }
          }, 50);
          return;
        }
      }
    };

    // Observe for the floating composer appearing
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: MutationObserver callback is inherently nested
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            // Check if this is or contains the thread/composer
            if (node.classList.contains('bn-thread') || node.querySelector('.bn-thread')) {
              focusCommentInput();
            }
          }
        }
      }
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [hasComments]);

  // Notify parent when editor is ready (for snapshots - Issue #42)
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Global keyboard shortcuts for undo/redo (works even when editor not focused)
  useEffect(() => {
    if (!editor) return;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keyboard handler needs multiple condition checks for platform detection, focus state, and modifier keys
    const handleUndoRedoKeyDown = (e: KeyboardEvent) => {
      // Detect platform
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Check if we're in an input/textarea (don't intercept their undo/redo)
      const target = e.target as HTMLElement;
      const isInInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Check if we're in BlockNote editor
      const isInBlockNote = target.closest('.bn-editor') !== null;

      if (cmdOrCtrl && e.key === 'z') {
        // Allow BlockNote's built-in shortcuts to work when focused
        if (isInBlockNote) return;

        // For all other cases, handle globally
        if (!isInInput) {
          e.preventDefault();
          editor.focus();

          // Type for yUndo extension
          interface YUndoExtension {
            undoCommand?: (state: unknown, dispatch: unknown, view: unknown) => void;
            redoCommand?: (state: unknown, dispatch: unknown, view: unknown) => void;
          }

          // Get the yUndo extension (used when collaboration is enabled)
          const yUndo = editor.getExtension('yUndo') as YUndoExtension | undefined;
          if (yUndo) {
            const { state, view } = editor._tiptapEditor;
            if (e.shiftKey) {
              // Cmd+Shift+Z or Ctrl+Shift+Z: Redo
              if (yUndo.redoCommand) {
                yUndo.redoCommand(state, view.dispatch, view);
              }
            } else {
              // Cmd+Z or Ctrl+Z: Undo
              if (yUndo.undoCommand) {
                yUndo.undoCommand(state, view.dispatch, view);
              }
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleUndoRedoKeyDown);
    return () => window.removeEventListener('keydown', handleUndoRedoKeyDown);
  }, [editor]);

  // Handle Enter to submit comments (Shift+Enter or Ctrl+Enter for newline)
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keyboard handling requires multiple condition checks
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Check if we're in a comment input (BlockNote thread component)
    const target = e.target as HTMLElement;
    const isInThread =
      target.closest('.bn-thread') ||
      target.closest('.bn-floating-composer') ||
      target.closest('[data-floating-composer]');

    if (!isInThread) return;

    if (e.key === 'Enter') {
      // Shift+Enter or Ctrl+Enter: Insert newline
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // For contenteditable (ProseMirror), let the default behavior handle it
        // ProseMirror already handles Shift+Enter as soft break
        return;
      }

      // Enter without modifier: Submit the comment
      e.preventDefault();
      e.stopPropagation();

      // BlockNote uses .bn-button inside .bn-action-toolbar for the save button
      const buttonSelectors = [
        '.bn-thread .bn-action-toolbar .bn-button',
        '.bn-thread button[type="submit"]',
        '.bn-thread .bn-button',
        '.bn-floating-composer .bn-button',
      ];

      for (const selector of buttonSelectors) {
        const submitButton = containerRef.current?.querySelector(selector);
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.click();
          return;
        }
      }
    }
  };

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Container needs keyboard handler for Ctrl+Enter comment submission
    <div
      ref={containerRef}
      className="relative mobile-blocknote bg-surface rounded-lg px-3 md:px-0"
      onKeyDown={handleKeyDown}
      role="application"
      aria-label="Plan viewer with comments"
    >
      {!identity && (
        <Alert status="default" className="mb-4">
          <Alert.Indicator>
            <User className="w-4 h-4" />
          </Alert.Indicator>
          <Alert.Content className="flex-1">
            <Alert.Title>Sign in to add comments</Alert.Title>
            <Alert.Description>
              Choose how you'd like to identify yourself to participate in discussions.
            </Alert.Description>
          </Alert.Content>
          <Button size="sm" variant="secondary" onPress={onRequestIdentity ?? (() => startAuth())}>
            Sign in
          </Button>
        </Alert>
      )}
      <BlockNoteView
        key={editorKey}
        editor={editor}
        theme={effectiveTheme}
        editable={!isViewingHistory}
        // Use custom formatting toolbar with comments integration
        formattingToolbar={false}
        // Disable default comments UI - we use ThreadsSidebar instead
        comments={false}
      >
        {/* Custom formatting toolbar - appears when text is selected */}
        <FormattingToolbarController
          formattingToolbar={() => (
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

              {hasComments ? (
                // User has identity - show real comment button
                <AddCommentButton />
              ) : (
                // No identity - show button that prompts for profile setup
                <button
                  type="button"
                  onClick={onRequestIdentity}
                  className="flex items-center gap-1.5 px-2 py-1 text-sm rounded hover:bg-muted"
                  title="Set up your profile to leave comments"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Comment
                </button>
              )}
            </FormattingToolbar>
          )}
        />
        {/* Floating composer for creating new comments - only when identity is set */}
        {hasComments && <FloatingComposerController />}
        {/* Floating thread controller - shows comments when clicking highlighted text */}
        <FloatingThreadController />
      </BlockNoteView>
    </div>
  );
}
