import { Button, Checkbox, Chip, Disclosure } from '@heroui/react';
import type { Artifact } from '@shipyard/schema';
import { useState } from 'react';
import { formatRelativeTime } from '@/utils/formatters';
import { ArtifactRenderer } from './ArtifactRenderer';

interface DeliverableCardProps {
  artifact: Artifact;
  registryPort: number | null;
}

/**
 * Icon component for each artifact type.
 */
function ArtifactTypeIcon({ type }: { type: Artifact['type'] }) {
  const iconClass = 'w-4 h-4 text-muted-foreground';

  switch (type) {
    case 'screenshot':
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    case 'video':
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      );
    case 'test_results':
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      );
    case 'diff':
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown artifact type: ${_exhaustive}`);
    }
  }
}

/**
 * Individual deliverable card showing artifact status and preview.
 * Uses HeroUI v3 compound components.
 */
export function DeliverableCard({ artifact, registryPort }: DeliverableCardProps) {
  // Check if artifact is attached based on storage type
  const isAttached = artifact.storage === 'github' ? !!artifact.url : !!artifact.localArtifactId;
  const displayName = artifact.description || artifact.filename;
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-surface border border-separator rounded-lg p-4">
      <div className="flex items-start gap-4">
        {/* Read-only checkbox showing attached status */}
        <Checkbox isReadOnly isSelected={isAttached} className="mt-0.5">
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox>

        <div className="flex-1 min-w-0">
          {/* Header: icon + name + status chip */}
          <div className="flex items-center gap-2 flex-wrap">
            <ArtifactTypeIcon type={artifact.type} />
            <span className="font-medium text-foreground truncate">{displayName}</span>
            <Chip size="sm" color={isAttached ? 'success' : 'default'} variant="soft">
              {isAttached ? 'attached' : 'pending'}
            </Chip>
          </div>

          {/* Collapsible preview (only if artifact is attached) */}
          {isAttached && (
            <Disclosure className="mt-3" isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
              <Disclosure.Heading>
                <Button slot="trigger" variant="tertiary" size="sm">
                  {artifact.filename}
                  <Disclosure.Indicator />
                </Button>
              </Disclosure.Heading>
              <Disclosure.Content>
                <div className="mt-2">
                  {/* Only render when expanded - fixes loading spinner issue */}
                  {isExpanded && (
                    <ArtifactRenderer artifact={artifact} registryPort={registryPort} />
                  )}
                </div>
              </Disclosure.Content>
            </Disclosure>
          )}

          {/* Timestamp if attached */}
          {artifact.uploadedAt && (
            <span className="text-xs text-muted-foreground mt-2 block">
              Attached {formatRelativeTime(artifact.uploadedAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
