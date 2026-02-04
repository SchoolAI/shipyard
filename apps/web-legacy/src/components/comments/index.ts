/**
 * Comment system components for the side-gutter UI.
 *
 * This module provides a Notion/Google Docs-style comment system
 * where comments appear alongside the editor at the vertical position
 * of their associated blocks.
 *
 * Desktop-only in this phase. Mobile support designed for but not implemented.
 */

export { CommentGutter, type CommentGutterContextValue } from './CommentGutter';
export { PlanViewerWithComments } from './PlanViewerWithComments';
export { ReplyForm } from './ReplyForm';
export { ThreadCard } from './ThreadCard';
export { AddCommentButton, ThreadComposer } from './ThreadComposer';
