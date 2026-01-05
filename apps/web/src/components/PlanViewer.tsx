import {
  CommentsExtension,
  DefaultThreadStoreAuth,
  YjsThreadStore,
} from '@blocknote/core/comments';
import { BlockNoteView } from '@blocknote/mantine';
import {
  AddCommentButton,
  FloatingComposerController,
  FloatingThreadController,
  FormattingToolbar,
  FormattingToolbarController,
  useCreateBlockNote,
} from '@blocknote/react';
import { useEffect, useRef } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { useTheme } from '@/hooks/useTheme';
import type { UserIdentity } from '@/utils/identity';

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
}

/**
 * Convert HSL color values to RGB.
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
          username: currentIdentity.displayName,
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

export function PlanViewer({ ydoc, identity, provider, onRequestIdentity }: PlanViewerProps) {
  // Comments are fully enabled only when identity is set
  const hasComments = identity !== null;
  const { theme } = useTheme();

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
      displayName: identity.displayName,
      color: identity.color,
    });
  }, [ydoc, identity]);

  // Create editor with all configuration in one place to avoid timing issues.
  // When identity is null, we don't enable comments at all.
  // When identity is set, we create the threadStore and extension inline.
  const editor = useCreateBlockNote(
    {
      // When collaboration is enabled, content comes from the Yjs fragment.
      // No initialContent needed - the editor syncs from DOCUMENT_FRAGMENT.
      collaboration: provider
        ? {
            provider,
            // Use 'document' key - this is the DOCUMENT_FRAGMENT (source of truth)
            fragment: ydoc.getXmlFragment('document'),
            user: identity
              ? {
                  name: identity.displayName,
                  color: identity.color,
                }
              : {
                  name: 'Anonymous',
                  color: 'hsl(0, 0%, 55%)', // Neutral gray works in light and dark modes
                },
          }
        : undefined,
      // ALWAYS load CommentsExtension to properly render comment marks in the document.
      // Without this, documents with comment marks will render incorrectly when
      // identity is null (e.g., after clearing browser data).
      // When identity is null, we use 'anonymous' as userId with 'comment' role (read-only).
      extensions: [
        CommentsExtension({
          threadStore: new YjsThreadStore(
            identity?.id ?? 'anonymous-viewer',
            ydoc.getMap('threads'),
            new DefaultThreadStoreAuth(
              identity?.id ?? 'anonymous-viewer',
              identity ? 'editor' : 'comment'
            )
          ),
          resolveUsers: createResolveUsers(ydoc, identity),
        }),
      ],
      // Note: We use editable={false} on BlockNoteView instead of _tiptapOptions
      // to make the editor read-only. BlockNote officially supports commenting
      // even when editable={false}. Using _tiptapOptions.handleKeyDown to block
      // input was causing comment mark position bugs by interfering with
      // ProseMirror's internal state management.
    },
    // Dependencies: recreate editor when ydoc, identity, or theme changes.
    // This ensures the extension is properly registered when identity becomes available,
    // and the editor re-renders with the correct theme when toggling dark mode.
    [ydoc, identity?.id, effectiveTheme]
  );

  // Note: We set editable={false} on BlockNoteView to make it read-only.
  // BlockNote officially supports commenting even when editable={false}.

  // Force BlockNoteView remount when switching plans or theme.
  // Identity changes are handled by the parent's key prop on PlanViewer.
  // Adding theme to key ensures BlockNote updates immediately without refresh.
  const editorKey = `${ydoc.guid}-${effectiveTheme}`;

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
      <BlockNoteView
        key={editorKey}
        editor={editor}
        editable={false} // Read-only, but comments still work per BlockNote docs
        theme={effectiveTheme}
        // Hide editing controls - this is a read-only view (except for comments)
        sideMenu={false}
        slashMenu={false}
        formattingToolbar={false}
        // Disable default comments UI - we use ThreadsSidebar instead
        comments={false}
      >
        {/* Custom formatting toolbar - appears when text is selected */}
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
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
