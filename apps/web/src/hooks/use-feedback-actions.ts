import type { DiffComment, PlanComment } from '@shipyard/loro-schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFeedback } from '../contexts/feedback-context';
import { countUniqueFiles } from '../utils/format-feedback';

const MAX_SUMMARIES = 5;
const SUMMARY_BODY_MAX_LENGTH = 60;
const CONFIRMATION_TIMEOUT_MS = 2000;

export interface CommentSummary {
  filePath: string;
  body: string;
  lineNumber: number;
}

function truncateBody(body: string): string {
  return body.length > SUMMARY_BODY_MAX_LENGTH
    ? `${body.slice(0, SUMMARY_BODY_MAX_LENGTH)}...`
    : body;
}

function buildSummaries(
  diffComments: DiffComment[],
  planComments: PlanComment[]
): CommentSummary[] {
  const summaries: CommentSummary[] = [];

  for (const c of diffComments) {
    if (summaries.length >= MAX_SUMMARIES) break;
    summaries.push({ filePath: c.filePath, body: truncateBody(c.body), lineNumber: c.lineNumber });
  }

  for (const c of planComments) {
    if (summaries.length >= MAX_SUMMARIES) break;
    summaries.push({ filePath: '(plan)', body: truncateBody(c.body), lineNumber: c.from });
  }

  return summaries;
}

export interface UseFeedbackActionsResult {
  feedbackState: 'idle' | 'queued' | 'sent';
  unresolvedCount: number;
  fileCount: number;
  isAgentRunning: boolean;
  commentSummaries: CommentSummary[];
  onSendFeedback: (additionalText: string) => void;
  onQueueFeedback: (additionalText: string) => void;
  onInterruptAndSend: (additionalText: string) => void;
}

export function useFeedbackActions(
  diffComments: DiffComment[],
  planComments: PlanComment[],
  deliveredCommentIds: string[],
  markCommentsDelivered: (ids: string[]) => void
): UseFeedbackActionsResult {
  const {
    onSubmit,
    onInterruptAndSend,
    isAgentRunning,
    composerModel,
    composerReasoning,
    composerPermission,
  } = useFeedback();

  const [feedbackState, setFeedbackState] = useState<'idle' | 'queued' | 'sent'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const deliveredSet = useMemo(() => new Set(deliveredCommentIds), [deliveredCommentIds]);

  const unresolvedDiffComments = useMemo(
    () => diffComments.filter((c) => c.resolvedAt === null && !deliveredSet.has(c.commentId)),
    [diffComments, deliveredSet]
  );

  const unresolvedPlanComments = useMemo(
    () => planComments.filter((c) => c.resolvedAt === null && !deliveredSet.has(c.commentId)),
    [planComments, deliveredSet]
  );

  const unresolvedCount = unresolvedDiffComments.length + unresolvedPlanComments.length;
  const fileCount = countUniqueFiles(unresolvedDiffComments);

  const commentSummaries = useMemo(
    () => buildSummaries(unresolvedDiffComments, unresolvedPlanComments),
    [unresolvedDiffComments, unresolvedPlanComments]
  );

  const setTemporaryState = useCallback((state: 'queued' | 'sent') => {
    setFeedbackState(state);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setFeedbackState('idle');
      timeoutRef.current = null;
    }, CONFIRMATION_TIMEOUT_MS);
  }, []);

  const buildPayload = useCallback(
    (additionalText: string) => {
      return {
        message: additionalText.trim(),
        images: [],
        model: composerModel,
        reasoningEffort: composerReasoning,
        permissionMode: composerPermission,
      };
    },
    [
      unresolvedDiffComments,
      unresolvedPlanComments,
      composerModel,
      composerReasoning,
      composerPermission,
    ]
  );

  const markDelivered = useCallback(() => {
    const ids = [
      ...unresolvedDiffComments.map((c) => c.commentId),
      ...unresolvedPlanComments.map((c) => c.commentId),
    ];
    if (ids.length > 0) markCommentsDelivered(ids);
  }, [unresolvedDiffComments, unresolvedPlanComments, markCommentsDelivered]);

  const handleSendFeedback = useCallback(
    (additionalText: string) => {
      if (unresolvedCount === 0) return;
      onSubmit(buildPayload(additionalText));
      markDelivered();
      setTemporaryState('sent');
    },
    [unresolvedCount, onSubmit, buildPayload, markDelivered, setTemporaryState]
  );

  const handleQueueFeedback = useCallback(
    (additionalText: string) => {
      if (unresolvedCount === 0) return;
      onSubmit(buildPayload(additionalText));
      markDelivered();
      setTemporaryState('queued');
    },
    [unresolvedCount, onSubmit, buildPayload, markDelivered, setTemporaryState]
  );

  const handleInterruptAndSendFeedback = useCallback(
    (additionalText: string) => {
      if (unresolvedCount === 0) return;
      onInterruptAndSend(buildPayload(additionalText));
      markDelivered();
      setTemporaryState('sent');
    },
    [unresolvedCount, onInterruptAndSend, buildPayload, markDelivered, setTemporaryState]
  );

  return {
    feedbackState,
    unresolvedCount,
    fileCount,
    isAgentRunning,
    commentSummaries,
    onSendFeedback: handleSendFeedback,
    onQueueFeedback: handleQueueFeedback,
    onInterruptAndSend: handleInterruptAndSendFeedback,
  };
}
