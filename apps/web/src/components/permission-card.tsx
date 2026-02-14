import { Button } from '@heroui/react';
import {
  type PermissionDecision,
  type PermissionRequest,
  TOOL_RISK_LEVELS,
  type ToolRiskLevel,
} from '@shipyard/loro-schema';
import { Check, ChevronDown, ChevronUp, Shield, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface PermissionCardProps {
  toolUseId: string;
  request: PermissionRequest;
  onRespond: (toolUseId: string, decision: PermissionDecision, opts?: { persist?: boolean; message?: string }) => void;
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

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

function getStringField(input: Record<string, unknown>, key: string, fallback: string): string {
  const val = input[key];
  return typeof val === 'string' ? val : fallback;
}

function summarizeBash(input: Record<string, unknown>): string {
  return truncate(getStringField(input, 'command', ''), 120);
}

function summarizeEdit(input: Record<string, unknown>): string {
  const filePath = getStringField(input, 'file_path', 'file');
  const oldStr = getStringField(input, 'old_string', '');
  const lineCount = oldStr.split('\n').length;
  return `${filePath} — editing ${lineCount} line${lineCount === 1 ? '' : 's'}`;
}

function summarizeWrite(input: Record<string, unknown>): string {
  return `${getStringField(input, 'file_path', 'file')} — creating file`;
}

function summarizeRead(input: Record<string, unknown>): string {
  return getStringField(input, 'file_path', 'file');
}

const TOOL_SUMMARIZERS: Record<string, (input: Record<string, unknown>) => string> = {
  Bash: summarizeBash,
  Edit: summarizeEdit,
  Write: summarizeWrite,
  Read: summarizeRead,
};

/**
 * Produce a human-readable summary of the tool action from its input JSON.
 * Falls back to a truncated raw input string for unknown tools.
 */
function summarizeToolAction(toolName: string, toolInput: string): string {
  try {
    // eslint-disable-next-line no-restricted-syntax -- toolInput is daemon-serialized JSON, shape is known at write site
    const input = JSON.parse(toolInput) as Record<string, unknown>;
    const summarizer = TOOL_SUMMARIZERS[toolName];
    if (summarizer) return summarizer(input);
    return `${toolName}: ${truncate(toolInput, 100)}`;
  } catch {
    return `${toolName}: ${truncate(toolInput, 100)}`;
  }
}

export function PermissionCard({ toolUseId, request, onRespond }: PermissionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResolved, setIsResolved] = useState(false);
  const allowRef = useRef<HTMLButtonElement>(null);

  const riskLevel: ToolRiskLevel = TOOL_RISK_LEVELS.includes(request.riskLevel as ToolRiskLevel)
    ? (request.riskLevel as ToolRiskLevel)
    : 'low';
  const borderClass = RISK_BORDER_CLASS[riskLevel];
  const summary = summarizeToolAction(request.toolName, request.toolInput);

  const handleAllow = useCallback(() => {
    setIsResolved(true);
    onRespond(toolUseId, 'approved');
  }, [toolUseId, onRespond]);

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

  useEffect(() => {
    if (!isResolved) {
      allowRef.current?.focus();
    }
  }, [isResolved]);

  if (isResolved) {
    return null;
  }

  let formattedInput = request.toolInput;
  try {
    formattedInput = JSON.stringify(JSON.parse(request.toolInput), null, 2);
  } catch {
    /* raw string is fine */
  }

  return (
    <div
      role="group"
      aria-label={`Permission request: ${request.toolName}`}
      className={`border-l-3 ${borderClass} bg-surface rounded-xl border border-separator p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2`}
      onKeyDown={handleKeyDown}
    >
      {/* Top row: tool name + risk badge + timestamp */}
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

      {/* Summary line */}
      <p className="text-sm text-foreground/90 leading-relaxed mb-2 font-mono break-all">
        {summary}
      </p>

      {/* Reason line (if present) */}
      {request.reason && (
        <p className="text-xs text-muted leading-relaxed mb-2">{request.reason}</p>
      )}

      {/* Description (if present) */}
      {request.description && (
        <p className="text-xs text-muted leading-relaxed mb-2">{request.description}</p>
      )}

      {/* Expandable detail: full toolInput */}
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

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          ref={allowRef}
          variant="primary"
          size="sm"
          onPress={handleAllow}
          className="min-w-[80px]"
        >
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          Allow
        </Button>
        <Button variant="danger-soft" size="sm" onPress={handleDeny} className="min-w-[80px]">
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          Deny
        </Button>
      </div>
    </div>
  );
}
