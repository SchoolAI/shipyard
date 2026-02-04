import type { Artifact } from '@shipyard/schema';
import { ArtifactRenderer } from './ArtifactRenderer';

interface ArtifactPreviewPanelProps {
  artifact: Artifact;
  registryPort: number | null;
}

/**
 * Full-height side panel for previewing artifacts.
 * Used in DeliverablesView for side-by-side artifact viewing on desktop.
 */
export function ArtifactPreviewPanel({ artifact, registryPort }: ArtifactPreviewPanelProps) {
  return (
    <div className="h-full overflow-y-auto p-4 bg-surface">
      <ArtifactRenderer artifact={artifact} registryPort={registryPort} />
    </div>
  );
}
