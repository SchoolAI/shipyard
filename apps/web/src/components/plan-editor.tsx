export { PlanEditor };

import { Button } from '@heroui/react';
import type { PlanComment } from '@shipyard/loro-schema';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { ContainerID, LoroDoc } from 'loro-crdt';
import { MessageSquarePlus } from 'lucide-react';
import { marked } from 'marked';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createExtensions, createLoroSyncExtension } from '../editor';
import { PlanCommentInput } from './plan/plan-comment-input';
import { PlanCommentWidget } from './plan/plan-comment-widget';

function syncCommentMarks(editor: Editor, comments: PlanComment[]) {
  const { tr } = editor.state;
  const commentMarkType = editor.schema.marks.comment;
  if (!commentMarkType) return;

  tr.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type === commentMarkType);
    if (mark) {
      tr.removeMark(pos, pos + node.nodeSize, commentMarkType);
    }
  });

  for (const comment of comments) {
    if (comment.resolvedAt !== null) continue;
    const docSize = tr.doc.content.size;
    if (comment.from >= docSize || comment.to > docSize) continue;
    tr.addMark(comment.from, comment.to, commentMarkType.create({ commentId: comment.commentId }));
  }

  if (tr.steps.length > 0) {
    editor.view.dispatch(tr);
  }
}

interface PlanEditorProps {
  markdown: string;
  editable?: boolean;
  comments?: PlanComment[];
  onAddComment?: (body: string, from: number, to: number, commentId: string) => void;
  onResolveComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  loroDoc?: LoroDoc | null;
  containerId?: ContainerID | null;
}

function PlanEditor({
  markdown,
  editable = false,
  comments = [],
  onAddComment,
  onResolveComment,
  onDeleteComment,
  loroDoc,
  containerId,
}: PlanEditorProps) {
  const isLoroMode = !!(loroDoc && containerId);

  const [showCommentInput, setShowCommentInput] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [widgetPosition, setWidgetPosition] = useState<{ top: number; left: number } | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ from: number; to: number } | null>(null);
  const prevHtmlRef = useRef<string | null>(null);

  const extensions = useMemo(() => {
    const base = createExtensions('No plan content', { loroSync: isLoroMode });
    if (isLoroMode) {
      base.push(createLoroSyncExtension(loroDoc, containerId));
    }
    return base;
  }, [isLoroMode, loroDoc, containerId]);

  const html = useMemo(() => {
    if (isLoroMode) return '';
    const result = marked.parse(markdown, { async: false });
    if (typeof result !== 'string')
      throw new Error('marked.parse returned async result unexpectedly');
    return result;
  }, [markdown, isLoroMode]);

  const editor = useEditor(
    {
      extensions,
      content: isLoroMode ? '' : html,
      editable: isLoroMode ? true : editable,
    },
    isLoroMode ? [loroDoc, containerId] : undefined
  );

  useEffect(() => {
    if (isLoroMode) return;
    if (!editor || editor.isDestroyed) return;
    if (prevHtmlRef.current === html) return;
    prevHtmlRef.current = html;
    editor.commands.setContent(html);
  }, [editor, html, isLoroMode]);

  // Comment marks are ProseMirror document mutations that would conflict with LoroSyncPlugin.
  // In Loro mode, skip applying external comment marks -- Phase 2 will use Loro Cursor API.
  useEffect(() => {
    if (isLoroMode) return;
    if (!editor || editor.isDestroyed) return;
    syncCommentMarks(editor, comments);
  }, [editor, comments, isLoroMode]);

  useEffect(() => {
    if (isLoroMode) return;
    if (editor && !editor.isDestroyed) {
      editor.setEditable(editable);
    }
  }, [editor, editable, isLoroMode]);

  const handleOpenCommentInput = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    selectionRef.current = { from, to };
    setShowCommentInput(true);
  }, [editor]);

  const handleCommentSubmit = useCallback(
    (body: string) => {
      if (!editor || !onAddComment || !selectionRef.current) return;
      const { from, to } = selectionRef.current;
      if (from === to) return;
      const commentId = crypto.randomUUID();
      editor.chain().focus().setTextSelection({ from, to }).setComment(commentId).run();
      onAddComment(body, from, to, commentId);
      setShowCommentInput(false);
      selectionRef.current = null;
    },
    [editor, onAddComment]
  );

  const handleCommentCancel = useCallback(() => {
    setShowCommentInput(false);
    selectionRef.current = null;
  }, []);

  const dismissWidget = useCallback(() => {
    setActiveCommentId(null);
    setWidgetPosition(null);
  }, []);

  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const markEl = target.closest('.comment-mark');
    if (!markEl) {
      setActiveCommentId(null);
      setWidgetPosition(null);
      return;
    }

    const commentId = markEl.getAttribute('data-comment-id');
    if (!commentId) return;

    const wrapperRect = editorWrapperRef.current?.getBoundingClientRect();
    const markRect = markEl.getBoundingClientRect();
    if (!wrapperRect) return;

    setActiveCommentId(commentId);
    setWidgetPosition({
      top: markRect.bottom - wrapperRect.top + 4,
      left: markRect.left - wrapperRect.left,
    });
  }, []);

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape' && activeCommentId) {
        e.preventDefault();
        dismissWidget();
      }
    },
    [activeCommentId, dismissWidget]
  );

  const activeComments = useMemo(
    () => (activeCommentId ? comments.filter((c) => c.commentId === activeCommentId) : []),
    [activeCommentId, comments]
  );

  const handleResolveComment = useCallback(
    (commentId: string) => {
      onResolveComment?.(commentId);
      setActiveCommentId(null);
      setWidgetPosition(null);
    },
    [onResolveComment]
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      if (editor && !editor.isDestroyed) {
        const commentMarkType = editor.schema.marks.comment;
        if (commentMarkType) {
          const ranges: Array<{ from: number; to: number }> = [];
          editor.state.doc.descendants((node, pos) => {
            if (!node.isText) return;
            const mark = node.marks.find(
              (m) => m.type === commentMarkType && m.attrs.commentId === commentId
            );
            if (mark) {
              ranges.push({ from: pos, to: pos + node.nodeSize });
            }
          });

          if (ranges.length > 0) {
            const { tr } = editor.state;
            for (const range of ranges.reverse()) {
              tr.removeMark(range.from, range.to, commentMarkType);
            }
            editor.view.dispatch(tr);
          }
        }
      }
      onDeleteComment?.(commentId);
      setActiveCommentId(null);
      setWidgetPosition(null);
    },
    [editor, onDeleteComment]
  );

  return (
    <div
      ref={editorWrapperRef}
      className="plan-editor relative"
      role="region"
      aria-label="Plan editor"
      onClick={handleEditorClick}
      onKeyDown={handleEditorKeyDown}
    >
      <EditorContent editor={editor} />

      {editor && onAddComment && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: ed, state }) => {
            const { from, to } = state.selection;
            if (from === to) return false;
            if (showCommentInput) return true;
            return !ed.isActive('comment');
          }}
        >
          {showCommentInput ? (
            <PlanCommentInput onSubmit={handleCommentSubmit} onCancel={handleCommentCancel} />
          ) : (
            <div className="bg-surface border border-separator/50 rounded-lg shadow-lg">
              <Button
                size="sm"
                variant="ghost"
                onPress={handleOpenCommentInput}
                className="text-xs h-8 px-3 gap-1.5"
                aria-label="Add comment to selection"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                Comment
              </Button>
            </div>
          )}
        </BubbleMenu>
      )}

      {activeCommentId &&
        widgetPosition &&
        activeComments.length > 0 &&
        onResolveComment &&
        onDeleteComment && (
          <div
            className="absolute z-50"
            style={{ top: widgetPosition.top, left: widgetPosition.left, maxWidth: 320 }}
          >
            <PlanCommentWidget
              comments={activeComments}
              onResolve={handleResolveComment}
              onDelete={handleDeleteComment}
            />
          </div>
        )}
    </div>
  );
}
