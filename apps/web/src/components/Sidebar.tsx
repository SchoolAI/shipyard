import {
  Button,
  Chip,
  Disclosure,
  DisclosureGroup,
  ListBox,
  ListBoxItem,
  Tooltip,
} from '@heroui/react';
import type { PlanIndexEntry } from '@peer-plan/schema';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import { Archive, ArchiveRestore, ChevronRight, FileText, Inbox, User, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ProfileSetup } from '@/components/ProfileSetup';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { useIdentity } from '@/hooks/useIdentity';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { useSharedPlans } from '@/hooks/useSharedPlans';
import {
  getShowArchived,
  getSidebarCollapsed,
  setShowArchived,
  setSidebarCollapsed,
} from '@/utils/uiPreferences';

interface PlanItemProps {
  plan: PlanIndexEntry;
  isShared?: boolean;
  peerCount?: number;
  onArchive?: (planId: string) => void;
  onUnarchive?: (planId: string) => void;
  isArchived?: boolean;
}

function PlanItem({
  plan,
  isShared,
  peerCount,
  onArchive,
  onUnarchive,
  isArchived,
}: PlanItemProps) {
  return (
    <div className="flex items-center justify-between gap-2 w-full">
      <span className="truncate flex-1 text-foreground">{plan.title}</span>
      <div className="flex items-center gap-2 shrink-0">
        {peerCount !== undefined && peerCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            {peerCount}
          </span>
        )}
        {isShared && !peerCount && <Users className="w-3 h-3 text-muted-foreground" />}

        {/* Archive button - visible on parent list item hover via CSS */}
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={isArchived ? 'Unarchive' : 'Archive'}
          onPress={() => {
            if (isArchived) {
              onUnarchive?.(plan.id);
            } else {
              onArchive?.(plan.id);
            }
          }}
          className="w-6 h-6 min-w-0 !p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {isArchived ? (
            <ArchiveRestore className="w-3.5 h-3.5" />
          ) : (
            <Archive className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

interface SidebarProps {
  /** Called after navigation (used to close mobile drawer) */
  onNavigate?: () => void;
  /** When true, skip CollapsiblePanel wrapper (used in mobile drawer) */
  inDrawer?: boolean;
}

interface CollapsedSidebarProps {
  inboxCount: number;
  localPlansCount: number;
  sharedPlansCount: number;
  showArchived: boolean;
  showProfile: boolean;
  onToggle: () => void;
  onToggleArchived: () => void;
  onShowProfile: (show: boolean) => void;
}

function CollapsedSidebar({
  inboxCount,
  localPlansCount,
  sharedPlansCount,
  showArchived,
  showProfile,
  onToggle,
  onToggleArchived,
  onShowProfile,
}: CollapsedSidebarProps) {
  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Expand button */}
      <div className="px-3 py-3 border-b border-separator">
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Expand sidebar"
              onPress={onToggle}
              className="w-full"
            >
              <ChevronRight className="w-4 h-4 text-foreground" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Expand sidebar</Tooltip.Content>
        </Tooltip>
      </div>

      {/* Navigation icons */}
      <nav className="flex-1 flex flex-col items-center gap-2 px-3 pt-3 overflow-y-auto">
        {/* Inbox indicator */}
        {inboxCount > 0 && (
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="Inbox"
                className="w-10 h-10 relative"
              >
                <Inbox className="w-5 h-5 text-warning" />
                {inboxCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-warning text-warning-foreground text-[10px] flex items-center justify-center font-semibold">
                    {inboxCount}
                  </span>
                )}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>Inbox ({inboxCount})</Tooltip.Content>
          </Tooltip>
        )}

        {/* My Plans indicator */}
        {localPlansCount > 0 && (
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="My Plans"
                className="w-10 h-10"
              >
                <FileText className="w-5 h-5 text-foreground" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>My Plans ({localPlansCount})</Tooltip.Content>
          </Tooltip>
        )}

        {/* Shared Plans indicator */}
        {sharedPlansCount > 0 && (
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="Shared Plans"
                className="w-10 h-10"
              >
                <Users className="w-5 h-5 text-foreground" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>Shared ({sharedPlansCount})</Tooltip.Content>
          </Tooltip>
        )}
      </nav>

      {/* Footer icons */}
      <div className="px-3 py-2 border-t border-separator flex flex-col items-center gap-2 shrink-0">
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Profile"
              onPress={() => onShowProfile(true)}
              className="w-10 h-10"
            >
              <User className="w-4 h-4 text-foreground" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Profile</Tooltip.Content>
        </Tooltip>
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label={showArchived ? 'Hide archived plans' : 'Show archived plans'}
              onPress={onToggleArchived}
              className={`w-10 h-10 ${showArchived ? 'text-primary' : ''}`}
            >
              <Archive className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{showArchived ? 'Hide archived' : 'Show archived'}</Tooltip.Content>
        </Tooltip>
        <div className="w-10 h-10 flex items-center justify-center">
          <ThemeToggle />
        </div>
      </div>

      {/* Profile modal */}
      {showProfile && (
        <ProfileSetup
          isEditing
          onComplete={() => {
            onShowProfile(false);
            toast.success('Profile updated');
          }}
          onCancel={() => onShowProfile(false)}
        />
      )}
    </div>
  );
}

export function Sidebar({ onNavigate, inDrawer = false }: SidebarProps) {
  const {
    plans: localPlans,
    inboxPlans,
    archivedPlans,
    activeCount,
    navigationTarget,
    clearNavigation,
  } = usePlanIndex();
  const { activePlanId, syncState } = useActivePlanSync();
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed);
  const [showProfile, setShowProfile] = useState(false);
  const [showArchived, setShowArchivedState] = useState(getShowArchived);
  const navigate = useNavigate();
  const location = useLocation();
  const { identity } = useIdentity();
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);

  // Memoize plan IDs to prevent infinite re-renders in useSharedPlans
  const localPlanIds = useMemo(() => localPlans.map((p) => p.id), [localPlans]);
  const sharedPlans = useSharedPlans(localPlanIds);

  const handleToggleArchived = () => {
    const newState = !showArchived;
    setShowArchivedState(newState);
    setShowArchived(newState);
  };

  const handleArchive = async (planId: string) => {
    if (!identity) {
      toast.error('Please set up your profile first');
      return;
    }

    const now = Date.now();

    // Update the plan's own metadata (for shared plans to be filtered)
    try {
      const planDoc = new (await import('yjs')).Doc();
      const idb = new (await import('y-indexeddb')).IndexeddbPersistence(planId, planDoc);
      await idb.whenSynced;

      planDoc.transact(() => {
        const metadata = planDoc.getMap('metadata');
        metadata.set('archivedAt', now);
        metadata.set('archivedBy', identity.displayName);
        metadata.set('updatedAt', now);
      });

      idb.destroy();

      // Trigger re-scan of shared plans
      window.dispatchEvent(new CustomEvent('indexeddb-plan-synced', { detail: { planId } }));
    } catch {
      // If plan doc doesn't exist, that's fine
    }

    // Also update plan-index
    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      setPlanIndexEntry(indexDoc, {
        ...entry,
        deletedAt: now,
        deletedBy: identity.displayName,
        updatedAt: now,
      });
    } else {
      // Shared plan - create new entry in plan-index
      const sharedPlan = [...sharedPlans, ...inboxPlans, ...localPlans].find(
        (p) => p.id === planId
      );
      if (sharedPlan) {
        setPlanIndexEntry(indexDoc, {
          ...sharedPlan,
          deletedAt: now,
          deletedBy: identity.displayName,
          updatedAt: now,
        });
      }
    }

    toast.success('Plan archived');
  };

  const handleUnarchive = async (planId: string) => {
    if (!identity) {
      toast.error('Please set up your profile first');
      return;
    }

    const now = Date.now();

    // Update the plan's own metadata
    try {
      const planDoc = new (await import('yjs')).Doc();
      const idb = new (await import('y-indexeddb')).IndexeddbPersistence(planId, planDoc);
      await idb.whenSynced;

      planDoc.transact(() => {
        const metadata = planDoc.getMap('metadata');
        metadata.delete('archivedAt');
        metadata.delete('archivedBy');
        metadata.set('updatedAt', now);
      });

      idb.destroy();

      // Trigger re-scan of shared plans
      window.dispatchEvent(new CustomEvent('indexeddb-plan-synced', { detail: { planId } }));
    } catch {
      // If plan doc doesn't exist, that's fine
    }

    // Update plan-index
    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      const { deletedAt: _removed1, deletedBy: _removed2, ...rest } = entry;
      setPlanIndexEntry(indexDoc, {
        ...rest,
        updatedAt: now,
      });
    }

    toast.success('Plan unarchived');
  };

  useEffect(() => {
    if (!navigationTarget) return;
    const targetPath = `/plan/${navigationTarget}`;
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
    clearNavigation();
  }, [navigationTarget, clearNavigation, navigate, location.pathname]);

  const handleToggle = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    setSidebarCollapsed(newState);
  };

  // Collapsed sidebar content (icon-only view)
  const collapsedContent = (
    <CollapsedSidebar
      inboxCount={inboxPlans.length}
      localPlansCount={localPlans.length}
      sharedPlansCount={sharedPlans.length}
      showArchived={showArchived}
      showProfile={showProfile}
      onToggle={handleToggle}
      onToggleArchived={handleToggleArchived}
      onShowProfile={setShowProfile}
    />
  );

  const content = (
    <>
      {/* Header with collapse button */}
      <div className="px-3 py-3 border-b border-separator flex items-center justify-between">
        <h2 className="font-semibold text-lg text-foreground">Plans</h2>
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Collapse sidebar"
              onPress={handleToggle}
            >
              <ChevronRight className="w-4 h-4 text-foreground rotate-180" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Collapse sidebar</Tooltip.Content>
        </Tooltip>
      </div>

      <nav className="flex-1 flex flex-col overflow-y-auto px-3 pt-3 pb-0">
        <DisclosureGroup>
          {/* Inbox section - plans needing attention */}
          {inboxPlans.length > 0 && (
            <Disclosure defaultExpanded>
              <Disclosure.Heading>
                <Disclosure.Trigger className="w-full">
                  <div className="flex items-center justify-between w-full px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <Disclosure.Indicator className="text-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">Inbox</span>
                    </div>
                    <Chip
                      size="sm"
                      variant="soft"
                      color="warning"
                      className="text-[10px] h-5 px-1.5"
                    >
                      {inboxPlans.length}
                    </Chip>
                  </div>
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body className="p-0">
                  <ListBox
                    className="p-0"
                    aria-label="Inbox plans"
                    selectionMode="single"
                    selectedKeys={activePlanId ? [activePlanId] : []}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0];
                      if (key) {
                        onNavigate?.();
                        navigate(`/plan/${key}`);
                      }
                    }}
                  >
                    {inboxPlans.map((plan) => (
                      <ListBoxItem
                        id={plan.id}
                        key={plan.id}
                        textValue={plan.title}
                        className="group"
                      >
                        <PlanItem
                          plan={plan}
                          peerCount={plan.id === activePlanId ? syncState?.peerCount : undefined}
                          onArchive={handleArchive}
                        />
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
          )}

          {/* My Plans section */}
          {localPlans.length > 0 && (
            <Disclosure defaultExpanded>
              <Disclosure.Heading>
                <Disclosure.Trigger className="w-full">
                  <div className="flex items-center justify-between w-full px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <Disclosure.Indicator className="text-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">My Plans</span>
                    </div>
                    {activeCount > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        {activeCount} {activeCount === 1 ? 'agent' : 'agents'}
                      </span>
                    )}
                  </div>
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body className="p-0">
                  <ListBox
                    className="p-0"
                    aria-label="My plans"
                    selectionMode="single"
                    selectedKeys={activePlanId ? [activePlanId] : []}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0];
                      if (key) {
                        // Close drawer first, then navigate
                        onNavigate?.();
                        navigate(`/plan/${key}`);
                      }
                    }}
                  >
                    {localPlans.map((plan) => (
                      <ListBoxItem
                        id={plan.id}
                        key={plan.id}
                        textValue={plan.title}
                        className="group"
                      >
                        <PlanItem
                          plan={plan}
                          peerCount={plan.id === activePlanId ? syncState?.peerCount : undefined}
                          onArchive={handleArchive}
                        />
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
          )}

          {/* Shared Plans section */}
          {sharedPlans.length > 0 && (
            <Disclosure defaultExpanded>
              <Disclosure.Heading>
                <Disclosure.Trigger className="w-full">
                  <div className="flex items-center justify-between w-full px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <Disclosure.Indicator className="text-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">
                        Shared with me
                      </span>
                    </div>
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body className="p-0">
                  <ListBox
                    className="p-0"
                    aria-label="Shared plans"
                    selectionMode="single"
                    selectedKeys={activePlanId ? [activePlanId] : []}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0];
                      if (key) {
                        // Close drawer first, then navigate
                        onNavigate?.();
                        navigate(`/plan/${key}`);
                      }
                    }}
                  >
                    {sharedPlans.map((plan) => (
                      <ListBoxItem
                        id={plan.id}
                        key={plan.id}
                        textValue={plan.title}
                        className="group"
                      >
                        <PlanItem
                          plan={plan}
                          isShared
                          peerCount={plan.id === activePlanId ? syncState?.peerCount : undefined}
                          onArchive={handleArchive}
                        />
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
          )}

          {/* Archived Plans section - shown when toggle is on */}
          {showArchived && archivedPlans.length > 0 && (
            <Disclosure defaultExpanded>
              <Disclosure.Heading>
                <Disclosure.Trigger className="w-full">
                  <div className="flex items-center justify-between w-full px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <Disclosure.Indicator className="text-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">Archived</span>
                    </div>
                    <Chip size="sm" variant="soft" className="text-[10px] h-5 px-1.5">
                      {archivedPlans.length}
                    </Chip>
                  </div>
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body className="p-0">
                  <ListBox
                    className="p-0"
                    aria-label="Archived plans"
                    selectionMode="single"
                    selectedKeys={activePlanId ? [activePlanId] : []}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0];
                      if (key) {
                        onNavigate?.();
                        navigate(`/plan/${key}`);
                      }
                    }}
                  >
                    {archivedPlans.map((plan) => (
                      <ListBoxItem
                        id={plan.id}
                        key={plan.id}
                        textValue={plan.title}
                        className="group opacity-60"
                      >
                        <PlanItem plan={plan} isArchived onUnarchive={handleUnarchive} />
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
          )}
        </DisclosureGroup>

        {/* Empty state */}
        {localPlans.length === 0 && sharedPlans.length === 0 && (
          <p className="text-muted-foreground text-sm p-2 text-center">No plans yet</p>
        )}
      </nav>

      {/* Footer with profile, archive toggle, and theme toggle */}
      <div className="px-3 py-2 border-t border-separator flex items-center gap-0 shrink-0 mt-auto">
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Profile"
          onPress={() => setShowProfile(true)}
          className="touch-target flex-1"
        >
          <User className="w-4 h-4 text-foreground" />
        </Button>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={showArchived ? 'Hide archived plans' : 'Show archived plans'}
          onPress={handleToggleArchived}
          className={`touch-target flex-1 ${showArchived ? 'text-primary' : ''}`}
        >
          <Archive className="w-4 h-4" />
        </Button>
        <div className="flex-1 flex justify-center">
          <ThemeToggle />
        </div>
      </div>

      {/* Profile modal */}
      {showProfile && (
        <ProfileSetup
          isEditing
          onComplete={() => {
            setShowProfile(false);
            toast.success('Profile updated');
          }}
          onCancel={() => setShowProfile(false)}
        />
      )}
    </>
  );

  // In drawer mode, render content directly (drawer provides wrapper)
  if (inDrawer) {
    return <div className="flex flex-col h-full bg-surface">{content}</div>;
  }

  // Desktop mode: wrap in CollapsiblePanel
  return (
    <CollapsiblePanel
      side="left"
      isOpen={!collapsed}
      onToggle={handleToggle}
      className="bg-surface"
      collapsedContent={collapsedContent}
    >
      {content}
    </CollapsiblePanel>
  );
}
