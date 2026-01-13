import {
  Button,
  Chip,
  ListBox,
  ListBoxItem,
  Popover,
  SearchField,
  Select,
  Tooltip,
} from '@heroui/react';
import type { PlanIndexEntry } from '@peer-plan/schema';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import {
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  ChevronRight,
  Filter,
  Inbox,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AccountSection } from '@/components/account';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import {
  filterAndSortPlans,
  SORT_OPTIONS,
  STATUS_FILTER_OPTIONS,
  useViewFilters,
} from '@/hooks/useViewFilters';
import { getSidebarCollapsed, setSidebarCollapsed } from '@/utils/uiPreferences';

// --- Plan Item Component ---

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

// --- Navigation Item Component ---

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  isActive: boolean;
  badge?: number;
  badgeColor?: 'warning' | 'default';
  onClick?: () => void;
}

function NavItem({
  icon,
  label,
  href,
  isActive,
  badge,
  badgeColor = 'warning',
  onClick,
}: NavItemProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        navigate(href);
      }}
      className={`
        w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm
        transition-colors cursor-pointer
        ${
          isActive
            ? 'bg-accent/10 text-accent font-medium'
            : 'text-foreground hover:bg-surface-hover'
        }
      `}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <Chip size="sm" variant="soft" color={badgeColor} className="text-[10px] h-5 px-1.5">
          {badge}
        </Chip>
      )}
    </button>
  );
}

// --- Collapsed Sidebar ---

interface CollapsedSidebarProps {
  inboxCount: number;
  archivedCount: number;
  onToggle: () => void;
  onNavigate?: () => void;
}

function CollapsedSidebar({
  inboxCount,
  archivedCount,
  onToggle,
  onNavigate,
}: CollapsedSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

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
      <nav className="flex-1 flex flex-col items-center gap-2 px-3 pt-2 overflow-y-auto">
        {/* Inbox */}
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant={location.pathname === '/inbox' ? 'secondary' : 'ghost'}
              size="sm"
              aria-label="Inbox"
              onPress={() => {
                onNavigate?.();
                navigate('/inbox');
              }}
              className="w-10 h-10 relative"
            >
              <Inbox className={`w-5 h-5 ${inboxCount > 0 ? 'text-warning' : ''}`} />
              {inboxCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-warning text-warning-foreground text-[10px] flex items-center justify-center font-semibold">
                  {inboxCount}
                </span>
              )}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Inbox ({inboxCount})</Tooltip.Content>
        </Tooltip>

        {/* Archive */}
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant={location.pathname === '/archive' ? 'secondary' : 'ghost'}
              size="sm"
              aria-label="Archive"
              onPress={() => {
                onNavigate?.();
                navigate('/archive');
              }}
              className="w-10 h-10"
            >
              <Archive className="w-5 h-5" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Archive ({archivedCount})</Tooltip.Content>
        </Tooltip>

        {/* Divider */}
        <div className="w-8 h-px bg-separator my-1" />

        {/* Search icon - TODO: Add search functionality when clicked */}
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Search plans"
              className="w-10 h-10"
            >
              <SearchField.SearchIcon />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Search</Tooltip.Content>
        </Tooltip>
      </nav>

      {/* Footer icons */}
      <div className="px-3 py-2 border-t border-separator flex flex-col items-center gap-2 shrink-0">
        <AccountSection collapsed />
        <div className="w-10 h-10 flex items-center justify-center">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

// --- Sidebar Props ---

interface SidebarProps {
  /** Called after navigation (used to close mobile drawer) */
  onNavigate?: () => void;
  /** When true, skip CollapsiblePanel wrapper (used in mobile drawer) */
  inDrawer?: boolean;
}

// --- Main Sidebar Component ---

export function Sidebar({ onNavigate, inDrawer = false }: SidebarProps) {
  const { identity: githubIdentity } = useGitHubAuth();
  const {
    myPlans,
    sharedPlans,
    inboxPlans,
    archivedPlans,
    navigationTarget,
    clearNavigation,
    isLoading,
    markPlanAsRead,
  } = usePlanIndex(githubIdentity?.username);
  const { activePlanId, syncState } = useActivePlanSync();
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed);
  const navigate = useNavigate();
  const location = useLocation();
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);

  // View filters
  const {
    searchQuery,
    sortBy,
    sortDirection,
    statusFilters,
    setSearchQuery,
    setSortBy,
    toggleSortDirection,
    toggleStatusFilter,
    clearFilters,
  } = useViewFilters();

  // Apply filters to each plan category (always apply filtering)
  const filteredInboxPlans = useMemo(() => {
    const { filteredPlans } = filterAndSortPlans(
      inboxPlans,
      searchQuery,
      sortBy,
      statusFilters,
      sortDirection
    );
    return filteredPlans;
  }, [inboxPlans, searchQuery, sortBy, statusFilters, sortDirection]);

  const filteredMyPlans = useMemo(() => {
    const { filteredPlans } = filterAndSortPlans(
      myPlans,
      searchQuery,
      sortBy,
      statusFilters,
      sortDirection
    );
    return filteredPlans;
  }, [myPlans, searchQuery, sortBy, statusFilters, sortDirection]);

  const filteredSharedPlans = useMemo(() => {
    const { filteredPlans } = filterAndSortPlans(
      sharedPlans,
      searchQuery,
      sortBy,
      statusFilters,
      sortDirection
    );
    return filteredPlans;
  }, [sharedPlans, searchQuery, sortBy, statusFilters, sortDirection]);

  const hasActiveFilters = searchQuery.trim() !== '' || statusFilters.length > 0;

  const handleArchive = async (planId: string) => {
    if (!githubIdentity) {
      toast.error('Please sign in with GitHub first');
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
        metadata.set('archivedBy', githubIdentity.displayName);
        metadata.set('updatedAt', now);
      });

      idb.destroy();
    } catch {
      // If plan doc doesn't exist, that's fine
    }

    // Also update plan-index
    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      setPlanIndexEntry(indexDoc, {
        ...entry,
        deletedAt: now,
        deletedBy: githubIdentity.displayName,
        updatedAt: now,
      });
    } else {
      const plan = [...sharedPlans, ...inboxPlans, ...myPlans].find((p) => p.id === planId);
      if (plan) {
        setPlanIndexEntry(indexDoc, {
          ...plan,
          deletedAt: now,
          deletedBy: githubIdentity.displayName,
          updatedAt: now,
        });
      }
    }

    toast.success('Plan archived');
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
      archivedCount={archivedPlans.length}
      onToggle={handleToggle}
      onNavigate={onNavigate}
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

      {/* Navigation Items */}
      <div className="px-3 py-2 border-b border-separator space-y-1">
        <NavItem
          icon={<Inbox className={`w-4 h-4 ${inboxPlans.length > 0 ? 'text-warning' : ''}`} />}
          label="Inbox"
          href="/inbox"
          isActive={location.pathname === '/inbox'}
          badge={inboxPlans.length}
          badgeColor="warning"
          onClick={onNavigate}
        />
        <NavItem
          icon={<Archive className="w-4 h-4" />}
          label="Archive"
          href="/archive"
          isActive={location.pathname === '/archive'}
          onClick={onNavigate}
        />
      </div>

      {/* Search and Filter controls inline */}
      <div className="px-3 py-2 border-b border-separator">
        <div className="flex items-center gap-1.5">
          {/* Search field */}
          <div className="flex-1 min-w-0">
            <SearchField aria-label="Search plans" value={searchQuery} onChange={setSearchQuery}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search..." className="text-sm" />
                {searchQuery.length > 0 && <SearchField.ClearButton />}
              </SearchField.Group>
            </SearchField>
          </div>

          {/* Filter popover */}
          <Popover>
            <Popover.Trigger>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="Filters"
                className={`w-9 h-9 shrink-0 relative ${hasActiveFilters ? 'text-accent' : ''}`}
              >
                <Filter className="w-4 h-4" />
                {hasActiveFilters && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-accent text-accent-foreground text-[8px] flex items-center justify-center font-semibold">
                    {(searchQuery.trim() ? 1 : 0) + statusFilters.length}
                  </span>
                )}
              </Button>
            </Popover.Trigger>
            <Popover.Content className="w-64">
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Filters</h3>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={clearFilters}
                      className="h-6 text-xs"
                    >
                      Clear all
                    </Button>
                  )}
                </div>

                {/* Sort dropdown */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Sort by</span>
                    <Button
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      onPress={toggleSortDirection}
                      className="w-6 h-6"
                      aria-label={`Sort direction: ${sortDirection}`}
                    >
                      <ArrowUpDown className="w-3 h-3" />
                    </Button>
                  </div>
                  <Select
                    aria-label="Sort plans"
                    selectedKey={sortBy}
                    onSelectionChange={(key) =>
                      setSortBy(key as 'name' | 'newest' | 'updated' | 'status')
                    }
                    className="w-full"
                  >
                    <Select.Trigger className="h-8">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {SORT_OPTIONS.map((option) => (
                          <ListBoxItem key={option.value} id={option.value}>
                            {option.label}
                          </ListBoxItem>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

                {/* Status filters */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div className="flex flex-wrap gap-1">
                    {STATUS_FILTER_OPTIONS.map((option) => {
                      const isActive = statusFilters.includes(option.value);
                      const chipColor =
                        option.color === 'primary'
                          ? 'accent'
                          : (option.color as
                              | 'default'
                              | 'warning'
                              | 'success'
                              | 'danger'
                              | 'accent');
                      return (
                        <Chip
                          key={option.value}
                          size="sm"
                          variant={isActive ? 'soft' : 'soft'}
                          color={isActive ? chipColor : 'default'}
                          className={`cursor-pointer text-[10px] h-5 px-1.5 ${isActive ? 'ring-1 ring-current' : 'opacity-60'}`}
                          onClick={() => toggleStatusFilter(option.value)}
                        >
                          {option.label}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Popover.Content>
          </Popover>
        </div>
      </div>

      <nav className="flex-1 flex flex-col overflow-y-auto px-3 pt-3 pb-0">
        <ListBox
          className="p-0"
          aria-label="All plans"
          selectionMode="single"
          selectedKeys={activePlanId ? [activePlanId] : []}
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            if (key) {
              markPlanAsRead(String(key));
              onNavigate?.();
              navigate(`/plan/${key}`);
            }
          }}
        >
          {/* Inbox plans */}
          {filteredInboxPlans.map((plan) => (
            <ListBoxItem id={plan.id} key={plan.id} textValue={plan.title} className="group">
              <PlanItem
                plan={plan}
                peerCount={plan.id === activePlanId ? syncState?.peerCount : undefined}
                onArchive={handleArchive}
              />
            </ListBoxItem>
          ))}

          {/* My Plans */}
          {filteredMyPlans.map((plan) => (
            <ListBoxItem id={plan.id} key={plan.id} textValue={plan.title} className="group">
              <PlanItem
                plan={plan}
                peerCount={plan.id === activePlanId ? syncState?.peerCount : undefined}
                onArchive={handleArchive}
              />
            </ListBoxItem>
          ))}

          {/* Shared Plans */}
          {filteredSharedPlans.map((plan) => (
            <ListBoxItem id={plan.id} key={plan.id} textValue={plan.title} className="group">
              <PlanItem
                plan={plan}
                isShared
                peerCount={plan.id === activePlanId ? syncState?.peerCount : undefined}
                onArchive={handleArchive}
              />
            </ListBoxItem>
          ))}

          {/* Note: Archived plans are NOT shown here - they only appear on /archive route */}
        </ListBox>

        {/* Empty/Loading state - only for active plans */}
        {filteredMyPlans.length === 0 &&
          filteredSharedPlans.length === 0 &&
          filteredInboxPlans.length === 0 && (
            <p className="text-muted-foreground text-sm p-2 text-center">
              {isLoading
                ? 'Loading plans...'
                : hasActiveFilters
                  ? 'No matching plans'
                  : 'No plans yet'}
            </p>
          )}
      </nav>

      {/* Footer with GitHub account and theme toggle */}
      <div className="px-3 py-2 border-t border-separator flex items-center justify-between gap-2 shrink-0 mt-auto">
        <AccountSection />
        <ThemeToggle />
      </div>
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
