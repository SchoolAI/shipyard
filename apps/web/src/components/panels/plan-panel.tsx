export { PlanPanelContent };

import { Button, Chip } from '@heroui/react';
import type { PlanComment, PlanVersion } from '@shipyard/loro-schema';
import { Check, ClipboardList, MessageSquareX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlanApproval } from '../../contexts/plan-approval-context';
import { FOCUS_PRIORITY, useFocusTarget } from '../../hooks/use-focus-hierarchy';
import { usePlanEditorDoc } from '../../hooks/use-plan-editor-doc';
import { useTaskDocument } from '../../hooks/use-task-document';
import { useUIStore } from '../../stores';
import { PlanEditor } from '../plan-editor';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4">
      <ClipboardList className="w-8 h-8 text-muted" />
      <p className="text-sm text-muted">No plan available</p>
    </div>
  );
}

function ApprovalFooter({ plan }: { plan: PlanVersion }) {
  const { pendingPermissions, respondToPermission } = usePlanApproval();
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const feedbackInputRef = useRef<HTMLInputElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);

  const isPending = plan.reviewStatus === 'pending' && pendingPermissions.has(plan.toolUseId);
  const activeSidePanel = useUIStore((s) => s.activeSidePanel);

  useFocusTarget({
    id: `panel-plan-approval-${plan.planId}`,
    ref: approveRef,
    priority: FOCUS_PRIORITY.PLAN_APPROVAL + 1,
    active: isPending && activeSidePanel === 'plan',
  });

  useEffect(() => {
    if (showFeedbackInput) {
      feedbackInputRef.current?.focus();
    }
  }, [showFeedbackInput]);

  if (plan.reviewStatus === 'approved') {
    return (
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-separator/30">
        <Chip size="sm" variant="soft" color="success">
          Approved
        </Chip>
      </div>
    );
  }

  if (plan.reviewStatus === 'changes-requested') {
    return (
      <div className="flex flex-col items-end gap-2 px-4 py-3 border-t border-separator/30">
        <Chip size="sm" variant="soft" color="warning">
          Changes Requested
        </Chip>
        {plan.reviewFeedback && (
          <p className="text-xs text-muted leading-relaxed">{plan.reviewFeedback}</p>
        )}
      </div>
    );
  }

  if (!isPending) return null;

  return (
    <div className="flex flex-col items-end gap-2 px-4 py-3 border-t border-separator/30">
      <div className="flex items-center gap-2">
        <Button
          ref={approveRef}
          variant="primary"
          size="sm"
          onPress={() => respondToPermission(plan.toolUseId, 'approved')}
        >
          <Check className="w-4 h-4" />
          Approve
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setShowFeedbackInput((prev) => !prev)}>
          <MessageSquareX className="w-4 h-4" />
          Request Changes
        </Button>
      </div>
      {showFeedbackInput && (
        <div className="flex items-center gap-2">
          <input
            ref={feedbackInputRef}
            type="text"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Describe requested changes..."
            className="flex-1 text-sm bg-background border border-separator/50 rounded-md px-3 py-1.5 text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-secondary"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && feedbackText.trim()) {
                respondToPermission(plan.toolUseId, 'denied', {
                  message: feedbackText.trim(),
                });
                setShowFeedbackInput(false);
                setFeedbackText('');
              }
            }}
            aria-label="Feedback for requested changes"
          />
          <Button
            variant="ghost"
            size="sm"
            isDisabled={!feedbackText.trim()}
            onPress={() => {
              respondToPermission(plan.toolUseId, 'denied', {
                message: feedbackText.trim(),
              });
              setShowFeedbackInput(false);
              setFeedbackText('');
            }}
          >
            Send
          </Button>
        </div>
      )}
    </div>
  );
}

function EditorLoadingState() {
  return (
    <div
      className="flex items-center gap-2 text-muted text-sm py-4"
      role="status"
      aria-label="Preparing editor"
    >
      <span className="animate-spin" aria-hidden="true">
        &#x27F3;
      </span>
      Preparing editor...
    </div>
  );
}

function ActivePlanContent({
  plan,
  isLatestVersion,
  loroDoc,
  containerId,
  isReady,
  comments,
  onAddComment,
  onResolveComment,
  onDeleteComment,
}: {
  plan: PlanVersion;
  isLatestVersion: boolean;
  loroDoc: import('loro-crdt').LoroDoc | null;
  containerId: import('loro-crdt').ContainerID | null;
  isReady: boolean;
  comments: PlanComment[];
  onAddComment: (body: string, from: number, to: number, commentId: string) => void;
  onResolveComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
}) {
  if (isLatestVersion && !isReady) {
    return <EditorLoadingState />;
  }

  return (
    <PlanEditor
      markdown={plan.markdown}
      editable={isLatestVersion}
      comments={comments}
      onAddComment={onAddComment}
      onResolveComment={onResolveComment}
      onDeleteComment={onDeleteComment}
      loroDoc={isLatestVersion ? loroDoc : null}
      containerId={isLatestVersion ? containerId : null}
    />
  );
}

function PlanPanelContent({ activeTaskId }: { activeTaskId: string | null }) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const { plans, planComments, addPlanComment, resolvePlanComment, deletePlanComment } =
    useTaskDocument(activeTaskId);

  const activePlanIndex = selectedVersion ?? (plans.length > 0 ? plans.length - 1 : null);
  const activePlan = useMemo(
    () => (activePlanIndex !== null ? (plans[activePlanIndex] ?? null) : null),
    [plans, activePlanIndex]
  );

  const isLatestVersion = activePlanIndex === plans.length - 1;

  const { loroDoc, containerId, isReady } = usePlanEditorDoc(
    activeTaskId,
    isLatestVersion ? (activePlan?.planId ?? null) : null
  );

  const activePlanComments = useMemo(
    () => planComments.filter((c) => activePlan !== null && c.planId === activePlan.planId),
    [planComments, activePlan]
  );

  const handleAddComment = useCallback(
    (body: string, from: number, to: number, commentId: string) => {
      if (!activePlan) return;
      addPlanComment({
        commentId,
        planId: activePlan.planId,
        from,
        to,
        body,
        authorId: 'local-user',
      });
    },
    [activePlan, addPlanComment]
  );

  const handleVersionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedVersion(Number(e.target.value));
  }, []);

  useEffect(() => {
    setSelectedVersion(null);
  }, [activeTaskId]);

  return (
    <div className="flex flex-col h-full">
      {plans.length > 1 && (
        <div className="flex items-center gap-2 px-3 h-9 border-b border-separator/30">
          <select
            aria-label="Plan version"
            value={activePlanIndex ?? 0}
            onChange={handleVersionChange}
            className="text-xs text-muted font-medium bg-transparent border-none outline-none cursor-pointer hover:text-foreground transition-colors"
          >
            {plans.map((plan, i) => (
              <option key={plan.planId} value={i}>
                v{i + 1}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        role="region"
        aria-label="Plan content"
        className="flex flex-col flex-1 min-h-0 overflow-y-auto"
      >
        {activePlan ? (
          <div className="px-4 py-3 text-sm text-foreground/90 leading-relaxed">
            <ActivePlanContent
              plan={activePlan}
              isLatestVersion={isLatestVersion}
              loroDoc={loroDoc}
              containerId={containerId}
              isReady={isReady}
              comments={activePlanComments}
              onAddComment={handleAddComment}
              onResolveComment={resolvePlanComment}
              onDeleteComment={deletePlanComment}
            />
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {activePlan && <ApprovalFooter plan={activePlan} />}
    </div>
  );
}
