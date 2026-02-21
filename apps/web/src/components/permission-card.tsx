import { Button, Dropdown } from '@heroui/react';
import {
  type PermissionDecision,
  type PermissionRequest,
  TOOL_RISK_LEVELS,
  type ToolRiskLevel,
} from '@shipyard/loro-schema';
import { Check, ChevronDown, ChevronUp, Shield, X } from 'lucide-react';
import { type Key, useCallback, useRef, useState } from 'react';
import { FOCUS_PRIORITY, useFocusTarget } from '../hooks/use-focus-hierarchy';
import { summarizeToolAction } from '../utils/tool-summarizers';

function isToolRiskLevel(value: string): value is ToolRiskLevel {
  return TOOL_RISK_LEVELS.some((level) => level === value);
}

interface PermissionCardProps {
  toolUseId: string;
  request: PermissionRequest;
  onRespond: (
    toolUseId: string,
    decision: PermissionDecision,
    opts?: { persist?: boolean; message?: string }
  ) => void;
}

const RISK_BORDER_CLASS: Record<ToolRiskLevel, string> = {
  low: 'border-l-secondary',
  medium: 'border-l-warning',
  high: 'border-l-danger',
};

const RISK_LABEL: Record<ToolRiskLevel, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
};

const RISK_LABEL_CLASS: Record<ToolRiskLevel, string> = {
  low: 'text-secondary',
  medium: 'text-warning',
  high: 'text-danger',
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function PermissionCard({ toolUseId, request, onRespond }: PermissionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResolved, setIsResolved] = useState(false);
  const allowRef = useRef<HTMLButtonElement>(null);

  const riskLevel: ToolRiskLevel = isToolRiskLevel(request.riskLevel)
    ? request.riskLevel
    : 'medium';
  const borderClass = RISK_BORDER_CLASS[riskLevel];
  const summary = summarizeToolAction(request.toolName, request.toolInput);

  const handleAllow = useCallback(() => {
    setIsResolved(true);
    onRespond(toolUseId, 'approved');
  }, [toolUseId, onRespond]);

  const handleAlwaysAllow = useCallback(() => {
    setIsResolved(true);
    onRespond(toolUseId, 'approved', { persist: true });
  }, [toolUseId, onRespond]);

  const handleDropdownAction = useCallback(
    (key: Key) => {
      if (key === 'always') {
        handleAlwaysAllow();
      }
    },
    [handleAlwaysAllow]
  );

  const handleDeny = useCallback(() => {
    setIsResolved(true);
    onRespond(toolUseId, 'denied');
  }, [toolUseId, onRespond]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDeny();
      }
    },
    [handleDeny]
  );

  useFocusTarget({
    id: `permission-${toolUseId}`,
    ref: allowRef,
    priority: FOCUS_PRIORITY.PERMISSION,
    active: !isResolved,
  });

  if (isResolved) {
    return null;
  }

  let formattedInput = request.toolInput;
  try {
    formattedInput = JSON.stringify(JSON.parse(request.toolInput), null, 2);
  } catch {
    /** raw string is fine */
  }

  return (
    <div
      role="group"
      aria-label={`Permission request: ${request.toolName}`}
      className={`border-l-3 ${borderClass} bg-surface rounded-xl border border-separator p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2`}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-3.5 h-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="text-xs font-medium text-muted truncate">{request.toolName}</span>
          <span className={`text-xs font-medium ${RISK_LABEL_CLASS[riskLevel]}`}>
            {RISK_LABEL[riskLevel]}
          </span>
        </div>
        <span className="text-xs text-muted tabular-nums shrink-0">
          {formatTimestamp(request.createdAt)}
        </span>
      </div>

      <p className="text-sm text-foreground/90 leading-relaxed mb-2 font-mono break-all">
        {summary}
      </p>

      {request.reason && (
        <p className="text-xs text-muted leading-relaxed mb-2">{request.reason}</p>
      )}

      {request.description && (
        <p className="text-xs text-muted leading-relaxed mb-2">{request.description}</p>
      )}

      <div className="mb-3">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
          aria-expanded={isExpanded}
          aria-controls={`perm-detail-${toolUseId}`}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? (
            <ChevronUp className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          )}
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
        {isExpanded && (
          <pre
            id={`perm-detail-${toolUseId}`}
            className="mt-2 p-3 rounded-lg bg-background text-xs text-foreground/80 font-mono overflow-x-auto max-h-48 border border-separator/50"
          >
            {formattedInput}
          </pre>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {/** Split button pattern: main Allow + dropdown chevron for "Always allow" */}
        <div className="flex items-center">
          <Button
            ref={allowRef}
            variant="primary"
            size="sm"
            onPress={handleAllow}
            className="rounded-r-none min-w-[80px]"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            Allow
          </Button>
          <Dropdown>
            <Button
              variant="primary"
              size="sm"
              isIconOnly
              aria-label="More allow options"
              className="rounded-l-none border-l border-l-white/20 min-w-0 w-8 min-h-[44px] sm:min-h-0"
            >
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            </Button>
            <Dropdown.Popover placement="bottom end" className="min-w-[200px]">
              <Dropdown.Menu onAction={handleDropdownAction} aria-label="Allow options">
                <Dropdown.Item key="always" id="always" textValue="Always allow this tool">
                  Always allow this tool
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>

        <Button variant="danger-soft" size="sm" onPress={handleDeny} className="min-w-[80px]">
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          Deny
        </Button>
      </div>
    </div>
  );
}
