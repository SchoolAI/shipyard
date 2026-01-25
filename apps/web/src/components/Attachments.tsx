import { type Artifact, getArtifacts } from '@shipyard/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { ArtifactRenderer } from './ArtifactRenderer';

export { useArtifactCount } from '@/hooks/useArtifactCount';

interface AttachmentsProps {
  ydoc: Y.Doc;
  registryPort: number | null;
}

/**
 * Section showing all artifacts attached to a plan.
 * Subscribes to Y.Doc changes for real-time updates.
 */
export function Attachments({ ydoc, registryPort }: AttachmentsProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  useEffect(() => {
    const array = ydoc.getArray<Artifact>('artifacts');

    const updateArtifacts = () => {
      setArtifacts(getArtifacts(ydoc));
    };

    updateArtifacts();
    array.observe(updateArtifacts);
    return () => array.unobserve(updateArtifacts);
  }, [ydoc]);

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-separator px-3 md:px-0">
      <h2 className="text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4">
        Attachments ({artifacts.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {artifacts.map((artifact) => (
          <div
            key={artifact.id}
            className="bg-surface rounded-lg border border-separator p-3 md:p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <ArtifactTypeIcon type={artifact.type} />
              <span className="text-sm font-medium text-foreground">{artifact.filename}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {artifact.type.replace('_', ' ')}
              </span>
            </div>
            <ArtifactRenderer artifact={artifact} registryPort={registryPort} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtifactTypeIcon({ type }: { type: Artifact['type'] }) {
  const iconClass = 'w-4 h-4 text-muted-foreground';

  switch (type) {
    case 'html':
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    case 'image':
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
    default: {
      /** Exhaustive check - this should never happen */
      const _exhaustive: never = type;
      throw new Error(`Unknown artifact type: ${_exhaustive}`);
    }
  }
}
