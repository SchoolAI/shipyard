import { Button, Disclosure, DisclosureGroup, ListBox, ListBoxItem } from '@heroui/react';
import type { PlanIndexEntry } from '@peer-plan/schema';
import { Settings, User, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { useSharedPlans } from '@/hooks/useSharedPlans';
import { getSidebarCollapsed, setSidebarCollapsed } from '@/utils/uiPreferences';

interface PlanItemProps {
  plan: PlanIndexEntry;
  isShared?: boolean;
  peerCount?: number;
}

function PlanItem({ plan, isShared, peerCount }: PlanItemProps) {
  return (
    <div className="flex items-center justify-between gap-2 w-full">
      <span className="truncate flex-1 text-foreground">{plan.title}</span>
      <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
        {peerCount !== undefined && peerCount > 0 && (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {peerCount}
          </span>
        )}
        {isShared && !peerCount && <Users className="w-3 h-3" />}
        <span className="capitalize">{plan.status.replace('_', ' ')}</span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { plans: localPlans, activeCount } = usePlanIndex();
  const { activePlanId, syncState } = useActivePlanSync();
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed);
  const navigate = useNavigate();

  // Memoize plan IDs to prevent infinite re-renders in useSharedPlans
  const localPlanIds = useMemo(() => localPlans.map((p) => p.id), [localPlans]);
  const sharedPlans = useSharedPlans(localPlanIds);

  const handleToggle = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    setSidebarCollapsed(newState);
  };

  return (
    <CollapsiblePanel
      side="left"
      isOpen={!collapsed}
      onToggle={handleToggle}
      className="bg-white dark:bg-surface"
    >
      <nav className="flex-1 flex flex-col overflow-y-auto p-2">
        <DisclosureGroup>
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
                <Disclosure.Body>
                  <ListBox
                    aria-label="My plans"
                    selectionMode="single"
                    selectedKeys={activePlanId ? [activePlanId] : []}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0];
                      if (key) navigate(`/plan/${key}`);
                    }}
                  >
                    {localPlans.map((plan) => (
                      <ListBoxItem id={plan.id} key={plan.id} textValue={plan.title}>
                        <PlanItem
                          plan={plan}
                          peerCount={plan.id === activePlanId ? syncState?.peerCount : undefined}
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
                <Disclosure.Body>
                  <ListBox
                    aria-label="Shared plans"
                    selectionMode="single"
                    selectedKeys={activePlanId ? [activePlanId] : []}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0];
                      if (key) navigate(`/plan/${key}`);
                    }}
                  >
                    {sharedPlans.map((plan) => (
                      <ListBoxItem id={plan.id} key={plan.id} textValue={plan.title}>
                        <PlanItem
                          plan={plan}
                          isShared
                          peerCount={plan.id === activePlanId ? syncState?.peerCount : undefined}
                        />
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

      {/* Footer with settings, profile, and theme toggle */}
      <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Settings"
            onPress={() => {
              /* TODO: Open settings */
            }}
          >
            <Settings className="w-4 h-4 text-foreground" />
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Profile"
            onPress={() => {
              /* TODO: Open profile */
            }}
          >
            <User className="w-4 h-4 text-foreground" />
          </Button>
        </div>
        <ThemeToggle />
      </div>
    </CollapsiblePanel>
  );
}
