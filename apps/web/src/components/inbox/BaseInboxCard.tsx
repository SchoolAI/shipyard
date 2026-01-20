/**
 * Base composable inbox card component.
 * Provides consistent structure for all inbox item types with slots for customization.
 */

import type React from 'react';

export interface BaseInboxCardProps {
  /** Plan title */
  title: string;
  /** Main status/type badge */
  badge: React.ReactNode;
  /** Secondary badges (tags, time, etc.) */
  metadata?: React.ReactNode;
  /** Expanded content (optional, for blockers/help requests) */
  expandedContent?: React.ReactNode;
  /** Whether item is unread (affects opacity) */
  isUnread: boolean;
  /** Click handler for the card */
  onClick: () => void;
  /** Action buttons in the actions slot */
  actions?: React.ReactNode;
}

/**
 * Base inbox card with composable slots for badge, metadata, content, and actions.
 * Handles read/unread opacity and clickable card behavior.
 */
export function BaseInboxCard({
  title,
  badge,
  metadata,
  expandedContent,
  isUnread,
  onClick,
  actions,
}: BaseInboxCardProps) {
  return (
    <button
      type="button"
      className={`flex items-center justify-between gap-3 w-full py-2 px-3 hover:bg-surface-hover transition-colors rounded-md text-left ${
        isUnread ? 'opacity-100' : 'opacity-60'
      }`}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-medium text-foreground truncate">{title}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {badge}
          {metadata}
        </div>
        {expandedContent}
      </div>

      {actions && (
        <div
          className="flex items-center gap-1 shrink-0"
          onClickCapture={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </button>
  );
}
