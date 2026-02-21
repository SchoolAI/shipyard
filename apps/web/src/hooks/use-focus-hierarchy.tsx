export {
  AUTOFOCUS_DELAY_MS,
  FOCUS_PRIORITY,
  FocusHierarchyProvider,
  useFocusHierarchy,
  useFocusTarget,
};

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useUIStore } from '../stores';

const AUTOFOCUS_DELAY_MS = 1000;

const FOCUS_PRIORITY = {
  COMPOSER: 10,
  COMMENT: 30,
  PANEL: 50,
  PLAN_APPROVAL: 60,
  PERMISSION: 70,
} as const;

interface FocusTargetOptions {
  id: string;
  ref: RefObject<{ focus: () => void } | null>;
  priority: number;
  active?: boolean;
}

interface FocusHierarchyContextValue {
  register: (opts: FocusTargetOptions) => void;
  unregister: (id: string) => void;
  update: (opts: FocusTargetOptions) => void;
  focusTarget: (id: string) => void;
  scheduleFocus: (id: string, delay: number) => void;
  cancelPending: () => void;
  activeTargetId: string | null;
}

const FocusHierarchyContext = createContext<FocusHierarchyContextValue | null>(null);

function useFocusHierarchyContext(): FocusHierarchyContextValue {
  const ctx = useContext(FocusHierarchyContext);
  if (!ctx) {
    throw new Error('useFocusHierarchy must be used within a <FocusHierarchyProvider>');
  }
  return ctx;
}

function findWinner(targets: Map<string, FocusTargetOptions>): FocusTargetOptions | null {
  let winner: FocusTargetOptions | null = null;
  for (const target of targets.values()) {
    if (target.active === false) continue;
    if (!winner || target.priority > winner.priority) {
      winner = target;
    }
  }
  return winner;
}

function FocusHierarchyProvider({ children }: { children: ReactNode }) {
  const isOverlayOpen = useUIStore(
    (s) => s.isCommandPaletteOpen || s.isShortcutsModalOpen || s.isSettingsOpen
  );

  const targetsRef = useRef(new Map<string, FocusTargetOptions>());
  const [version, setVersion] = useState(0);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRafRef = useRef<number>(0);
  const isOverlayOpenRef = useRef(isOverlayOpen);
  isOverlayOpenRef.current = isOverlayOpen;

  const clearPending = useCallback(() => {
    clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = undefined;
    cancelAnimationFrame(pendingRafRef.current);
    pendingRafRef.current = 0;
  }, []);

  useEffect(() => {
    if (isOverlayOpen) return;

    const winner = findWinner(targetsRef.current);
    if (!winner) {
      setActiveTargetId(null);
      return;
    }

    clearPending();

    pendingRafRef.current = requestAnimationFrame(() => {
      winner.ref.current?.focus();
      setActiveTargetId(winner.id);
    });

    return () => {
      clearPending();
    };
  }, [version, isOverlayOpen, clearPending]);

  const register = useCallback((opts: FocusTargetOptions) => {
    targetsRef.current.set(opts.id, opts);
    setVersion((v) => v + 1);
  }, []);

  const unregister = useCallback((id: string) => {
    targetsRef.current.delete(id);
    setVersion((v) => v + 1);
  }, []);

  const update = useCallback((opts: FocusTargetOptions) => {
    targetsRef.current.set(opts.id, opts);
    setVersion((v) => v + 1);
  }, []);

  const focusTarget = useCallback(
    (id: string) => {
      clearPending();
      const target = targetsRef.current.get(id);
      if (target) {
        pendingRafRef.current = requestAnimationFrame(() => {
          target.ref.current?.focus();
        });
        setActiveTargetId(id);
      }
    },
    [clearPending]
  );

  const scheduleFocus = useCallback(
    (id: string, delay: number) => {
      clearPending();

      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = undefined;
        if (isOverlayOpenRef.current) return;

        const winner = findWinner(targetsRef.current);
        const requested = targetsRef.current.get(id);
        if (requested && winner && winner.id === id) {
          pendingRafRef.current = requestAnimationFrame(() => {
            requested.ref.current?.focus();
            setActiveTargetId(id);
          });
        }
      }, delay);
    },
    [clearPending]
  );

  const contextValue = useMemo(
    (): FocusHierarchyContextValue => ({
      register,
      unregister,
      update,
      focusTarget,
      scheduleFocus,
      cancelPending: clearPending,
      activeTargetId,
    }),
    [register, unregister, update, focusTarget, scheduleFocus, clearPending, activeTargetId]
  );

  return <FocusHierarchyContext value={contextValue}>{children}</FocusHierarchyContext>;
}

function useFocusTarget(options: FocusTargetOptions): void {
  const { register, unregister, update } = useFocusHierarchyContext();
  const prevRef = useRef(options);

  useEffect(() => {
    register(options);
    return () => unregister(options.id);
  }, [register, unregister, options.id]);

  useEffect(() => {
    prevRef.current = options;
    update(options);
  }, [options.priority, options.active, options.ref, update]);
}

function useFocusHierarchy() {
  const ctx = useFocusHierarchyContext();
  return {
    focusTarget: ctx.focusTarget,
    scheduleFocus: ctx.scheduleFocus,
    cancelPending: ctx.cancelPending,
    activeTargetId: ctx.activeTargetId,
  };
}
