import { Avatar, Button, Card, Checkbox } from '@heroui/react';
import { ChevronDown, ChevronUp, MessageSquare, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { InlineThread } from '@/loro/selectors/task-selectors';
import { colorFromString } from '@/utils/color';
import { formatRelativeTime } from '@/utils/formatters';
import { ReplyForm } from './reply-form';

interface ThreadCardProps {
  thread: InlineThread;
  isActive?: boolean;
  onClick?: () => void;
  onScrollToBlock?: () => void;
  onReply?: (body: string) => void;
  onToggleResolved?: () => void;
  onDelete?: () => void;
  currentUserId?: string;
  canReply?: boolean;
}

interface CommentItemProps {
  comment: {
    id: string;
    body: string;
    author: string;
    createdAt: number;
  };
  isFirst: boolean;
  isResolved?: boolean;
}

function formatUserId(userId: string): string {
  if (userId.startsWith('local:')) {
    return userId.slice(6);
  }
  if (userId.includes('(')) {
    const parts = userId.split('(');
    return (parts[0] ?? userId).trim();
  }
  return userId;
}

function getInitials(userId: string): string {
  const name = formatUserId(userId);
  const parts = name.split(/[\s_-]+/);
  if (parts.length >= 2) {
    const first = parts[0] ?? '';
    const second = parts[1] ?? '';
    const firstChar = first[0];
    const secondChar = second[0];
    if (firstChar && secondChar) {
      return (firstChar + secondChar).toUpperCase();
    }
  }
  return name.slice(0, 2).toUpperCase();
}

function CommentItem({ comment, isFirst, isResolved = false }: CommentItemProps) {
  const displayName = formatUserId(comment.author);
  const initials = getInitials(comment.author);
  const color = colorFromString(comment.author);

  const borderClass = isFirst ? '' : 'pt-3 border-t border-separator';
  const nameClass = isResolved ? 'text-muted-foreground' : 'text-foreground';
  const bodyClass = isResolved ? 'text-muted-foreground line-through' : 'text-foreground';

  return (
    <div className={`flex gap-3 ${borderClass}`}>
      <Avatar size="sm" className="shrink-0">
        <Avatar.Fallback style={{ backgroundColor: color, color: 'white' }}>
          {initials}
        </Avatar.Fallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className={`font-medium text-sm truncate ${nameClass}`}>{displayName}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatRelativeTime(comment.createdAt)}
          </span>
        </div>
        <p className={`text-sm whitespace-pre-wrap break-words ${bodyClass}`}>{comment.body}</p>
      </div>
    </div>
  );
}

interface ThreadHeaderProps {
  selectedText?: string | null;
  isResolved: boolean;
  onScrollToBlock?: () => void;
  onToggleResolved?: () => void;
  onDelete?: () => void;
}

function ThreadHeader({
  selectedText,
  isResolved,
  onScrollToBlock,
  onToggleResolved,
  onDelete,
}: ThreadHeaderProps) {
  const handleScrollClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onScrollToBlock?.();
  };

  const handleResolveChange = (isSelected: boolean) => {
    if (isSelected !== isResolved) {
      onToggleResolved?.();
    }
  };

  const textClass = isResolved ? 'text-muted-foreground/70' : 'text-muted-foreground';

  return (
    <div className="flex items-start justify-between px-3 pt-2">
      {selectedText ? (
        <button
          type="button"
          className={`flex-1 text-xs truncate cursor-pointer hover:text-foreground mr-2 text-left ${textClass}`}
          onClick={handleScrollClick}
          title="Click to scroll to this text"
        >
          "{selectedText}"
        </button>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center gap-1 shrink-0">
        {onToggleResolved && (
          <Checkbox
            isSelected={isResolved}
            onChange={handleResolveChange}
            aria-label={isResolved ? 'Unresolve thread' : 'Resolve thread'}
            className="scale-90"
          >
            <Checkbox.Control className="size-4">
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
        )}

        {onDelete && (
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onDelete}
            aria-label="Delete thread"
            className="w-6 h-6 min-w-0 text-muted-foreground hover:text-danger"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface ExpandedContentProps {
  comments: Array<{
    id: string;
    body: string;
    author: string;
    createdAt: number;
  }>;
  isResolved: boolean;
  hasReplies: boolean;
  canReply: boolean;
  showReplyForm: boolean;
  onShowReplyForm: () => void;
  onHideReplyForm: () => void;
  onReply?: (body: string) => void;
  onToggleExpand: () => void;
}

function ExpandedContent({
  comments,
  isResolved,
  hasReplies,
  canReply,
  showReplyForm,
  onShowReplyForm,
  onHideReplyForm,
  onReply,
  onToggleExpand,
}: ExpandedContentProps) {
  const handleReplySubmit = (body: string) => {
    onReply?.(body);
    onHideReplyForm();
  };

  return (
    <div className="px-3 pb-3 space-y-3">
      {hasReplies && (
        <div className="space-y-3 pl-8">
          {comments.slice(1).map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              isFirst={false}
              isResolved={isResolved}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-end pt-2 border-t border-separator">
        <div className="flex items-center gap-2">
          {canReply && !showReplyForm && (
            <Button size="sm" variant="secondary" onPress={onShowReplyForm}>
              Reply
            </Button>
          )}

          {hasReplies && (
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              onPress={onToggleExpand}
              aria-label="Collapse replies"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {showReplyForm && (
        <ReplyForm
          onSubmit={handleReplySubmit}
          onCancel={onHideReplyForm}
          placeholder="Write a reply..."
        />
      )}
    </div>
  );
}

export function ThreadCard({
  thread,
  isActive = false,
  onClick,
  onScrollToBlock,
  onReply,
  onToggleResolved,
  onDelete,
  canReply = false,
}: ThreadCardProps) {
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [showReplyForm, setShowReplyForm] = useState(false);

  const firstComment = thread.comments[0];
  const hasReplies = thread.comments.length > 1;
  const replyCount = thread.comments.length - 1;

  const handleCardClick = () => {
    onClick?.();
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  if (!firstComment) return null;

  const isResolved = thread.resolved;
  const cardClass = `w-full transition-all duration-200 ${isActive ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'} ${isResolved ? 'opacity-60 bg-muted/30' : ''}`;

  return (
    <Card className={cardClass} variant="default">
      <ThreadHeader
        selectedText={thread.selectedText}
        isResolved={isResolved}
        onScrollToBlock={onScrollToBlock}
        onToggleResolved={onToggleResolved}
        onDelete={onDelete}
      />

      <button
        type="button"
        className="w-full text-left px-3 pb-3 pt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
        onClick={handleCardClick}
        aria-expanded={isExpanded}
        aria-label={`Comment thread with ${thread.comments.length} comment${thread.comments.length > 1 ? 's' : ''}`}
      >
        <CommentItem comment={firstComment} isFirst={true} isResolved={isResolved} />

        {hasReplies && !isExpanded && (
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <MessageSquare className="w-3 h-3" />
            <span>
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </span>
            <ChevronDown className="w-3 h-3 ml-auto" />
          </div>
        )}
      </button>

      {isExpanded && (
        <ExpandedContent
          comments={thread.comments}
          isResolved={isResolved}
          hasReplies={hasReplies}
          canReply={canReply}
          showReplyForm={showReplyForm}
          onShowReplyForm={() => setShowReplyForm(true)}
          onHideReplyForm={() => setShowReplyForm(false)}
          onReply={onReply}
          onToggleExpand={() => setIsExpanded(false)}
        />
      )}
    </Card>
  );
}
