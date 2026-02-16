export { SidePanelToolbarProvider, useSidePanelToolbar, useSidePanelToolbarSlot };

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

interface SidePanelToolbarContextValue {
  toolbar: ReactNode;
  setToolbar: (node: ReactNode) => void;
}

const SidePanelToolbarContext = createContext<SidePanelToolbarContextValue | null>(null);

function SidePanelToolbarProvider({ children }: { children: ReactNode }) {
  const [toolbar, setToolbar] = useState<ReactNode>(null);
  return (
    <SidePanelToolbarContext value={{ toolbar, setToolbar }}>{children}</SidePanelToolbarContext>
  );
}

function useSidePanelToolbar(): SidePanelToolbarContextValue {
  const ctx = useContext(SidePanelToolbarContext);
  if (!ctx) {
    throw new Error('useSidePanelToolbar must be used within a <SidePanelToolbarProvider>');
  }
  return ctx;
}

function useSidePanelToolbarSlot(content: ReactNode) {
  const { setToolbar } = useSidePanelToolbar();
  useEffect(() => {
    setToolbar(content);
    return () => setToolbar(null);
  }, [content, setToolbar]);
}
