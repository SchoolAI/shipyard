import { Eye, Users } from 'lucide-react';

export interface CollabBannerProps {
  ownerUsername: string | null;
  currentRole: 'owner' | 'collaborator-full' | 'collaborator-review' | 'viewer' | string;
}

function RoleLabel({ role }: { role: string }) {
  switch (role) {
    case 'collaborator-full':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.03em] bg-success/15 text-success">
          <Users className="w-3 h-3" aria-hidden="true" />
          Collaborator
        </span>
      );
    case 'viewer':
    case 'collaborator-review':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.03em] bg-muted/15 text-muted">
          <Eye className="w-3 h-3" aria-hidden="true" />
          {role === 'viewer' ? 'Viewer' : 'Reviewer'}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.03em] bg-muted/15 text-muted">
          {role}
        </span>
      );
  }
}

export function CollabBanner({ ownerUsername, currentRole }: CollabBannerProps) {
  return (
    <div
      role="status"
      aria-label={`Collaboration session: ${ownerUsername ? `viewing ${ownerUsername}'s task` : 'viewing shared task'}`}
      className="flex items-center justify-center gap-2 px-4 h-8 bg-accent/10 border-b border-separator/50"
    >
      <span className="text-xs text-accent">
        {ownerUsername ? `Viewing ${ownerUsername}'s task` : 'Viewing shared task'}
      </span>
      <RoleLabel role={currentRole} />
    </div>
  );
}
