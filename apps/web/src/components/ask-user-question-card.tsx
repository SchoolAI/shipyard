import { Button, Chip } from '@heroui/react';
import { Check, ChevronDown, HelpCircle } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePlanApproval } from '../contexts/plan-approval-context';
import { FOCUS_PRIORITY, useFocusTarget } from '../hooks/use-focus-hierarchy';
import type { GroupedBlock } from '../utils/group-content-blocks';

interface AskUserQuestionCardProps {
  group: GroupedBlock & { kind: 'ask_question' };
}

const OTHER_KEY = '__other__';
const EMPTY_SET = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseResolvedAnswers(
  toolResult: { content: string } | null
): Record<string, string> | null {
  if (!toolResult?.content) return null;
  try {
    const parsed: unknown = JSON.parse(toolResult.content);
    if (!isRecord(parsed)) return null;
    const answers = parsed.answers;
    if (!isRecord(answers)) return null;
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(answers)) {
      if (typeof val === 'string') result[key] = val;
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

export function AskUserQuestionCard({ group }: AskUserQuestionCardProps) {
  const { pendingPermissions, respondToPermission } = usePlanApproval();
  const isPending = pendingPermissions.has(group.toolUse.toolUseId);
  const [selections, setSelections] = useState<Map<number, Set<string>>>(new Map());
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(new Map());
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const submitRef = useRef<HTMLButtonElement>(null);

  const hasAllAnswers = useMemo(() => {
    if (group.questions.length === 0) return true;
    for (let qIdx = 0; qIdx < group.questions.length; qIdx++) {
      const sel = selections.get(qIdx);
      if (!sel || sel.size === 0) return false;
      if (sel.has(OTHER_KEY) && !(otherTexts.get(qIdx) ?? '').trim()) return false;
    }
    return true;
  }, [group.questions, selections, otherTexts]);

  useFocusTarget({
    id: `ask-question-${group.toolUse.toolUseId}`,
    ref: submitRef,
    priority: FOCUS_PRIORITY.PERMISSION,
    active: isPending && hasAllAnswers,
  });

  const handleOptionSelect = useCallback(
    (questionIndex: number, value: string, multiSelect: boolean) => {
      setSelections((prev) => {
        const next = new Map(prev);
        if (multiSelect) {
          const current = new Set(prev.get(questionIndex) ?? []);
          if (current.has(value)) {
            current.delete(value);
          } else {
            current.add(value);
          }
          next.set(questionIndex, current);
        } else {
          next.set(questionIndex, new Set([value]));
        }
        return next;
      });
    },
    []
  );

  const handleOtherTextChange = useCallback((questionIndex: number, text: string) => {
    setOtherTexts((prev) => {
      const next = new Map(prev);
      next.set(questionIndex, text);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const answers: Record<string, string> = {};
    for (const [qIdx, question] of group.questions.entries()) {
      const sel = selections.get(qIdx);
      if (!sel || sel.size === 0) continue;
      if (sel.has(OTHER_KEY)) {
        answers[question.question] = otherTexts.get(qIdx) ?? '';
      } else {
        const selected = [...sel].filter((v) => v !== OTHER_KEY);
        answers[question.question] = selected.join(', ');
      }
    }
    respondToPermission(group.toolUse.toolUseId, 'approved', {
      message: JSON.stringify({ answers }),
    });
  }, [group, selections, otherTexts, respondToPermission]);

  const resolvedAnswers = useMemo(
    () => (!isPending ? parseResolvedAnswers(group.toolResult) : null),
    [isPending, group.toolResult]
  );

  const borderColor = isPending ? 'border-l-secondary' : 'border-l-success';
  const firstHeader =
    group.questions[0]?.header || group.questions[0]?.question.slice(0, 40) || 'Question';

  return (
    <div
      role="article"
      aria-label="Question"
      className={`${borderColor} border-l-3 rounded-xl border border-separator/30 bg-surface/30 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-separator/30">
        <HelpCircle className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">Question</span>
        {isPending && (
          <Chip size="sm" variant="soft">
            {firstHeader}
          </Chip>
        )}
        {!isPending && (
          <Chip size="sm" variant="soft" color="success">
            <Check className="w-3 h-3" />
            Answered
          </Chip>
        )}
        <span className="ml-auto shrink-0" />
        <button
          type="button"
          aria-label={expanded ? 'Collapse question' : 'Expand question'}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((prev) => !prev)}
          className="text-muted hover:text-foreground"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 motion-safe:transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {expanded && isPending && (
        <div id={contentId} className="px-4 py-3">
          {group.questions.map((question, qIdx) => (
            <QuestionSection
              key={qIdx}
              question={question}
              questionIndex={qIdx}
              selectedValues={selections.get(qIdx) ?? EMPTY_SET}
              otherText={otherTexts.get(qIdx) ?? ''}
              onSelect={handleOptionSelect}
              onOtherTextChange={handleOtherTextChange}
            />
          ))}
        </div>
      )}

      {expanded && !isPending && (
        <div id={contentId} className="px-4 py-3">
          {resolvedAnswers ? (
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(resolvedAnswers).map(([q, answer]) => (
                <div key={q} className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">{q}:</span>
                  <Chip size="sm" variant="soft" color="success">
                    <Check className="w-3 h-3" />
                    {answer}
                  </Chip>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Chip size="sm" variant="soft" color="success">
                <Check className="w-3 h-3" />
                Answered
              </Chip>
            </div>
          )}
        </div>
      )}

      {isPending && hasAllAnswers && (
        <div className="flex justify-end px-4 py-3 border-t border-separator/30">
          <Button
            ref={submitRef}
            variant="primary"
            size="sm"
            className="min-w-[100px]"
            onPress={handleSubmit}
          >
            <Check className="w-3.5 h-3.5" />
            Submit
          </Button>
        </div>
      )}
    </div>
  );
}

interface QuestionSectionProps {
  question: {
    question: string;
    options: { label: string; description: string }[];
    multiSelect: boolean;
  };
  questionIndex: number;
  selectedValues: Set<string>;
  otherText: string;
  onSelect: (questionIndex: number, value: string, multiSelect: boolean) => void;
  onOtherTextChange: (questionIndex: number, text: string) => void;
}

function QuestionSection({
  question,
  questionIndex,
  selectedValues,
  otherText,
  onSelect,
  onOtherTextChange,
}: QuestionSectionProps) {
  const groupLabelId = useId();

  return (
    <div className="mb-4 last:mb-0">
      <p id={groupLabelId} className="text-sm text-foreground/90 font-medium mb-3">
        {question.question}
      </p>
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-labelledby is valid on both radiogroup and group roles; Biome cannot verify dynamic role */}
      <div
        className="flex flex-col gap-2"
        role={question.multiSelect ? 'group' : 'radiogroup'}
        aria-labelledby={groupLabelId}
      >
        {question.options.map((option, optIdx) => (
          <OptionCard
            key={`${optIdx}-${option.label}`}
            label={option.label}
            description={option.description}
            isSelected={selectedValues.has(option.label)}
            multiSelect={question.multiSelect}
            onSelect={() => onSelect(questionIndex, option.label, question.multiSelect)}
          />
        ))}
        <OtherOptionCard
          isSelected={selectedValues.has(OTHER_KEY)}
          multiSelect={question.multiSelect}
          otherText={otherText}
          onSelect={() => onSelect(questionIndex, OTHER_KEY, question.multiSelect)}
          onTextChange={(text) => onOtherTextChange(questionIndex, text)}
        />
      </div>
    </div>
  );
}

interface OptionCardProps {
  label: string;
  description: string;
  isSelected: boolean;
  multiSelect: boolean;
  onSelect: () => void;
}

function OptionCard({ label, description, isSelected, multiSelect, onSelect }: OptionCardProps) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-checked is valid on both radio and checkbox roles; Biome cannot verify dynamic role
    <button
      type="button"
      role={multiSelect ? 'checkbox' : 'radio'}
      aria-checked={isSelected}
      onClick={onSelect}
      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer motion-safe:transition-colors text-left min-h-[48px] ${
        isSelected
          ? 'bg-secondary/10 border-secondary'
          : 'bg-default/50 border-separator/50 hover:bg-default/70'
      }`}
    >
      <SelectionIndicator isSelected={isSelected} multiSelect={multiSelect} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="text-xs text-muted mt-0.5">{description}</div>}
      </div>
    </button>
  );
}

interface OtherOptionCardProps {
  isSelected: boolean;
  multiSelect: boolean;
  otherText: string;
  onSelect: () => void;
  onTextChange: (text: string) => void;
}

function OtherOptionCard({
  isSelected,
  multiSelect,
  otherText,
  onSelect,
  onTextChange,
}: OtherOptionCardProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSelected) {
      inputRef.current?.focus();
    }
  }, [isSelected]);

  return (
    <div
      className={`rounded-lg border motion-safe:transition-colors ${
        isSelected
          ? 'bg-secondary/10 border-secondary'
          : 'bg-default/50 border-separator/50 hover:bg-default/70'
      }`}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-checked is valid on both radio and checkbox roles; Biome cannot verify dynamic role */}
      <button
        type="button"
        role={multiSelect ? 'checkbox' : 'radio'}
        aria-checked={isSelected}
        onClick={onSelect}
        className="flex items-start gap-3 p-3 w-full cursor-pointer text-left min-h-[48px]"
      >
        <SelectionIndicator isSelected={isSelected} multiSelect={multiSelect} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">Other</div>
          <div className="text-xs text-muted mt-0.5">Specify a different answer</div>
        </div>
      </button>
      {isSelected && (
        <div className="px-3 pb-3">
          <label htmlFor={inputId} className="sr-only">
            Describe your answer
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={otherText}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Describe your preferred option..."
            className="w-full text-sm bg-background border border-separator/50 rounded-md px-3 py-1.5 text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-secondary"
          />
        </div>
      )}
    </div>
  );
}

function SelectionIndicator({
  isSelected,
  multiSelect,
}: {
  isSelected: boolean;
  multiSelect: boolean;
}) {
  if (multiSelect) {
    return (
      <div
        className={`w-[18px] h-[18px] rounded mt-0.5 shrink-0 flex items-center justify-center border-2 motion-safe:transition-colors ${
          isSelected ? 'border-secondary bg-secondary' : 'border-muted'
        }`}
        aria-hidden="true"
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>
    );
  }

  return (
    <div
      className={`w-[18px] h-[18px] rounded-full mt-0.5 shrink-0 flex items-center justify-center border-2 motion-safe:transition-colors ${
        isSelected ? 'border-secondary' : 'border-muted'
      }`}
      aria-hidden="true"
    >
      {isSelected && <div className="w-2 h-2 rounded-full bg-secondary" />}
    </div>
  );
}
