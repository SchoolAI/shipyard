import type { TaskArtifact, TaskId } from '@shipyard/loro-schema';
import { useTaskArtifacts } from '@/loro/selectors/task-selectors';
import { ArtifactRenderer } from './artifact-renderer';

interface AttachmentsProps {
  taskId: TaskId;
}

type ArtifactType = TaskArtifact[number];

function ArtifactTypeIcon({ type }: { type: ArtifactType['type'] }) {
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
      const _exhaustive: never = type;
      throw new Error(`Unknown artifact type: ${_exhaustive}`);
    }
  }
}

export function Attachments({ taskId }: AttachmentsProps) {
  const artifacts = useTaskArtifacts(taskId);

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
            <ArtifactRenderer artifact={artifact} />
          </div>
        ))}
      </div>
    </div>
  );
}
