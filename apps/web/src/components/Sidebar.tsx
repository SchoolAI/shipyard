import { Button, Chip, Tooltip } from '@heroui/react';
import { PLAN_INDEX_DOC_NAME } from '@shipyard/schema';
import { Archive, ChevronRight, Inbox, LayoutGrid, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AccountSection } from '@/components/account';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { getPlanRoute } from '@/constants/routes';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useInputRequests } from '@/hooks/useInputRequests';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { getSidebarCollapsed, setSidebarCollapsed } from '@/utils/uiPreferences';

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

interface CollapsedSidebarProps {
  inboxCount: number;
  archivedCount: number;
  isLoading: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

function CollapsedSidebar({
  inboxCount,
  archivedCount,
  isLoading,
  onToggle,
  onNavigate,
}: CollapsedSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide counts during loading to prevent flash from 0→actual
  const displayInboxCount = isLoading ? 0 : inboxCount;

  return (
    <div className="flex flex-col h-full bg-surface">
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

      <nav className="flex-1 flex flex-col items-center gap-2 px-3 pt-2 overflow-y-auto">
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
              <Inbox className={`w-5 h-5 ${displayInboxCount > 0 ? 'text-warning' : ''}`} />
              {!isLoading && displayInboxCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-warning text-warning-foreground text-[10px] flex items-center justify-center font-semibold">
                  {displayInboxCount}
                </span>
              )}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Inbox {isLoading ? '' : `(${displayInboxCount})`}</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant={location.pathname === '/board' ? 'secondary' : 'ghost'}
              size="sm"
              aria-label="Board"
              onPress={() => {
                onNavigate?.();
                navigate('/board');
              }}
              className="w-10 h-10"
            >
              <LayoutGrid className="w-5 h-5" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Board</Tooltip.Content>
        </Tooltip>

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

        <div className="w-8 h-px bg-separator my-1" />

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant={location.pathname === '/search' ? 'secondary' : 'ghost'}
              size="sm"
              onPress={() => {
                onNavigate?.();
                navigate('/search');
              }}
              aria-label="Search"
              className="w-10 h-10"
            >
              <Search className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Search tasks</Tooltip.Content>
        </Tooltip>
      </nav>

      <div className="px-3 py-2 border-t border-separator flex flex-col items-center gap-2 shrink-0">
        <AccountSection collapsed />
        <div className="w-10 h-10 flex items-center justify-center">
          <ThemeToggle />
        </div>
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

export function Sidebar({ onNavigate, inDrawer = false }: SidebarProps) {
  const { identity: githubIdentity } = useGitHubAuth();
  const { inboxPlans, archivedPlans, navigationTarget, clearNavigation, isLoading } = usePlanIndex(
    githubIdentity?.username
  );
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const { pendingRequests } = useInputRequests({ ydoc: indexDoc });
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed);
  const navigate = useNavigate();
  const location = useLocation();

  // Calculate total inbox count (plans + input requests)
  const totalInboxCount = useMemo(() => {
    return inboxPlans.length + pendingRequests.length;
  }, [inboxPlans, pendingRequests]);

  useEffect(() => {
    if (!navigationTarget) return;
    const targetPath = getPlanRoute(navigationTarget);
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

  const collapsedContent = (
    <CollapsedSidebar
      inboxCount={totalInboxCount}
      archivedCount={archivedPlans.length}
      isLoading={isLoading}
      onToggle={handleToggle}
      onNavigate={onNavigate}
    />
  );

  const content = (
    <>
      <div className="px-3 py-3 border-b border-separator flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="Shipyard" className="w-5 h-5" />
          <h2 className="font-semibold text-lg text-foreground">Shipyard</h2>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="Search"
                onPress={() => navigate('/search')}
              >
                <Search className="w-4 h-4" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>Search tasks</Tooltip.Content>
          </Tooltip>
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
      </div>

      <div className="px-3 py-2 border-b border-separator space-y-1">
        <NavItem
          icon={
            <Inbox
              className={`w-4 h-4 ${!isLoading && totalInboxCount > 0 ? 'text-warning' : ''}`}
            />
          }
          label="Inbox"
          href="/inbox"
          isActive={location.pathname === '/inbox'}
          badge={isLoading ? undefined : totalInboxCount}
          badgeColor="warning"
          onClick={onNavigate}
        />
        <NavItem
          icon={<LayoutGrid className="w-4 h-4" />}
          label="Board"
          href="/board"
          isActive={location.pathname === '/board'}
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

      {/* Spacer to push footer to bottom */}
      <div className="flex-1" />

      <div className="px-3 py-2 border-t border-separator flex items-center justify-between gap-2 shrink-0 mt-auto">
        <AccountSection />
        <ThemeToggle />
      </div>
    </>
  );

  if (inDrawer) {
    return <div className="flex flex-col h-full bg-surface">{content}</div>;
  }

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
