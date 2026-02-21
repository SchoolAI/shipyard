export type { SidePanelHandle, SidePanelProps };
export { SidePanel };

import { ClipboardList, GitCompareArrows, X } from 'lucide-react';
import {
  type CSSProperties,
  forwardRef,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  SidePanelToolbarProvider,
  useSidePanelToolbar,
} from '../../contexts/side-panel-toolbar-context';
import { useResizablePanel } from '../../hooks/use-resizable-panel';
import { useUIStore } from '../../stores';
import type { SidePanelId } from '../../stores/ui-store';

const SM_BREAKPOINT = 640;

interface SidePanelHandle {
  focus: () => void;
}

interface SidePanelProps {
  children: ReactNode;
}

function ToolbarSlot() {
  const { toolbar } = useSidePanelToolbar();
  return <>{toolbar}</>;
}

interface TabDefinition {
  id: SidePanelId;
  label: string;
  icon: typeof ClipboardList;
}

const TABS: TabDefinition[] = [
  { id: 'plan', label: 'Plan', icon: ClipboardList },
  { id: 'diff', label: 'Diff', icon: GitCompareArrows },
];

const TAB_IDS: SidePanelId[] = TABS.map((t) => t.id);

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < SM_BREAKPOINT
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SM_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

function getAsideClassName(isMobile: boolean, isOpen: boolean, isDragging: boolean): string {
  const base = 'shrink-0 bg-background overflow-hidden';
  if (isMobile) {
    return `${base} fixed inset-y-0 right-0 z-40 w-full max-w-md motion-safe:transition-transform motion-safe:duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`;
  }
  const transition = isDragging
    ? ''
    : 'motion-safe:transition-[width] motion-safe:duration-300 ease-in-out';
  return `${base} relative h-full border-l border-separator/50 ${transition}`;
}

const SidePanel = forwardRef<SidePanelHandle, SidePanelProps>(function SidePanel(
  { children },
  ref
) {
  const contentRef = useRef<HTMLDivElement>(null);

  const activeSidePanel = useUIStore((s) => s.activeSidePanel);
  const sidePanelWidth = useUIStore((s) => s.sidePanelWidth);
  const setSidePanelWidth = useUIStore((s) => s.setSidePanelWidth);
  const setActiveSidePanel = useUIStore((s) => s.setActiveSidePanel);

  const isOpen = activeSidePanel !== null;
  const isMobile = useIsMobile();

  const { panelRef, separatorProps, panelStyle, isDragging } = useResizablePanel({
    isOpen,
    width: sidePanelWidth,
    onWidthChange: setSidePanelWidth,
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => contentRef.current?.focus(),
    }),
    []
  );

  const handleClose = useCallback(() => {
    setActiveSidePanel(null);
  }, [setActiveSidePanel]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setActiveSidePanel(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, setActiveSidePanel]);

  const handleTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (!activeSidePanel) return;

      e.preventDefault();
      const currentIndex = TAB_IDS.indexOf(activeSidePanel);
      const nextIndex =
        e.key === 'ArrowRight'
          ? (currentIndex + 1) % TAB_IDS.length
          : (currentIndex - 1 + TAB_IDS.length) % TAB_IDS.length;
      const nextId = TAB_IDS[nextIndex];
      if (nextId) {
        setActiveSidePanel(nextId);
        document.getElementById(`side-panel-tab-${nextId}`)?.focus();
      }
    },
    [activeSidePanel, setActiveSidePanel]
  );

  const asideStyle: CSSProperties | undefined = isMobile ? undefined : panelStyle;

  return (
    <>
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onPointerDown={handleClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={panelRef}
        aria-label="Side panel"
        aria-hidden={!isOpen}
        inert={!isOpen || undefined}
        style={asideStyle}
        className={getAsideClassName(isMobile, isOpen, isDragging)}
      >
        {isOpen && !isMobile && <div {...separatorProps} />}

        <SidePanelToolbarProvider>
          <div className="flex flex-col h-full min-w-0 sm:min-w-[400px]">
            <div className="flex items-center h-10 border-b border-separator/50">
              <div
                role="tablist"
                aria-label="Side panel tabs"
                className="flex items-center gap-1 px-3 h-full"
                onKeyDown={handleTabKeyDown}
              >
                {TABS.map((tab) => {
                  const isActive = activeSidePanel === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`side-panel-tab-${tab.id}`}
                      aria-selected={isActive}
                      aria-controls={`side-panel-tabpanel-${tab.id}`}
                      tabIndex={isActive ? 0 : -1}
                      className={[
                        'relative h-full px-3 text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                        isActive
                          ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent'
                          : 'text-muted hover:text-foreground',
                      ].join(' ')}
                      onClick={() => setActiveSidePanel(tab.id)}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 flex items-center justify-end gap-1 px-2">
                <ToolbarSlot />
                <button
                  type="button"
                  aria-label="Close side panel"
                  className="sm:hidden inline-flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-foreground hover:bg-default/50 transition-colors"
                  onClick={handleClose}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div
              ref={contentRef}
              role="tabpanel"
              id={`side-panel-tabpanel-${activeSidePanel}`}
              aria-labelledby={`side-panel-tab-${activeSidePanel}`}
              tabIndex={isOpen ? 0 : -1}
              className="flex flex-col flex-1 min-h-0 focus-visible-ring"
            >
              {children}
            </div>
          </div>
        </SidePanelToolbarProvider>
      </aside>
    </>
  );
});
