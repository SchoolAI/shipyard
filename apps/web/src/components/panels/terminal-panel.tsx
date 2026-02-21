import '@xterm/xterm/css/xterm.css';

import { Button } from '@heroui/react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import { Terminal, X } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useVerticalResizablePanel } from '../../hooks/use-vertical-resizable-panel';
import { useUIStore } from '../../stores';

const CONTROL_PREFIX = '\x00\x01\x00';

function sendResize(channel: RTCDataChannel, cols: number, rows: number) {
  if (channel.readyState === 'open') {
    channel.send(CONTROL_PREFIX + JSON.stringify({ type: 'resize', cols, rows }));
  }
}

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTaskId: string | null;
  createTerminalChannel: (taskId: string) => RTCDataChannel | null;
  peerState: import('../../hooks/use-webrtc-sync').PeerState;
  selectedEnvironmentPath: string | null;
}

export interface TerminalPanelHandle {
  focus: () => void;
  write: (data: string | Uint8Array) => void;
}

interface TerminalSession {
  xterm: XTerm;
  fitAddon: FitAddon;
  wrapperDiv: HTMLDivElement;
  channel: RTCDataChannel | null;
  cwdSent: boolean;
  disposers: Array<() => void>;
}

export const TerminalPanel = forwardRef<TerminalPanelHandle, TerminalPanelProps>(
  function TerminalPanel(
    { isOpen, onClose, activeTaskId, createTerminalChannel, peerState, selectedEnvironmentPath },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sessionsRef = useRef(new Map<string, TerminalSession>());

    const terminalPanelHeight = useUIStore((s) => s.terminalPanelHeight);
    const setTerminalPanelHeight = useUIStore((s) => s.setTerminalPanelHeight);

    const { panelRef, separatorProps, panelStyle, isDragging } =
      useVerticalResizablePanel<HTMLDivElement>({
        isOpen,
        height: terminalPanelHeight,
        onHeightChange: setTerminalPanelHeight,
      });

    const ensureSession = useCallback((taskId: string): TerminalSession => {
      const existing = sessionsRef.current.get(taskId);
      if (existing) return existing;

      const fitAddon = new FitAddon();
      const xterm = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        theme: {
          background: '#0a0a0a',
          foreground: '#e4e4e7',
          cursor: '#e4e4e7',
          selectionBackground: '#3f3f4680',
        },
        allowProposedApi: true,
      });
      xterm.loadAddon(fitAddon);

      const wrapperDiv = document.createElement('div');
      wrapperDiv.style.width = '100%';
      wrapperDiv.style.height = '100%';
      xterm.open(wrapperDiv);

      const session: TerminalSession = {
        xterm,
        fitAddon,
        wrapperDiv,
        channel: null,
        cwdSent: false,
        disposers: [],
      };
      sessionsRef.current.set(taskId, session);
      return session;
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      if (!isOpen || !activeTaskId) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        return;
      }

      const session = ensureSession(activeTaskId);

      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      container.appendChild(session.wrapperDiv);

      requestAnimationFrame(() => {
        session.fitAddon.fit();
        session.xterm.focus();
      });

      return () => {
        if (session.wrapperDiv.parentNode === container) {
          container.removeChild(session.wrapperDiv);
        }
      };
    }, [isOpen, activeTaskId, ensureSession]);

    /** Effect: channel wiring -- create/reuse a data channel for the active task */
    useEffect(() => {
      if (!isOpen || !activeTaskId) return;

      const session = sessionsRef.current.get(activeTaskId);
      if (!session) return;

      if (!session.channel || session.channel.readyState === 'closed') {
        const ch = createTerminalChannel(activeTaskId);
        if (!ch) return;
        session.channel = ch;
      }

      const channel = session.channel;
      const { xterm } = session;

      const onMessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          xterm.write(event.data);
        } else {
          xterm.write(new Uint8Array(event.data));
        }
      };
      channel.addEventListener('message', onMessage);

      const onData = xterm.onData((data) => {
        if (channel.readyState === 'open') {
          channel.send(data);
        }
      });

      const sendInitial = () => {
        if (selectedEnvironmentPath && !session.cwdSent) {
          channel.send(
            CONTROL_PREFIX + JSON.stringify({ type: 'cwd', path: selectedEnvironmentPath })
          );
          session.cwdSent = true;
        }
        sendResize(channel, xterm.cols, xterm.rows);
      };

      if (channel.readyState === 'open') {
        sendInitial();
      } else {
        const onOpen = () => sendInitial();
        channel.addEventListener('open', onOpen);
        session.disposers.push(() => channel.removeEventListener('open', onOpen));
      }

      return () => {
        channel.removeEventListener('message', onMessage);
        onData.dispose();
        for (const dispose of session.disposers) {
          dispose();
        }
        session.disposers = [];
      };
    }, [isOpen, activeTaskId, createTerminalChannel, peerState, selectedEnvironmentPath]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container || !isOpen || !activeTaskId) return;

      const observer = new ResizeObserver(() => {
        const session = sessionsRef.current.get(activeTaskId);
        if (!session) return;
        requestAnimationFrame(() => {
          session.fitAddon.fit();
          if (session.channel) {
            sendResize(session.channel, session.xterm.cols, session.xterm.rows);
          }
        });
      });

      observer.observe(container);
      return () => observer.disconnect();
    }, [isOpen, activeTaskId]);

    useEffect(() => {
      return () => {
        for (const [, session] of sessionsRef.current) {
          for (const dispose of session.disposers) {
            dispose();
          }
          session.xterm.dispose();
          if (session.channel) {
            session.channel.close();
          }
        }
        sessionsRef.current.clear();
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          if (activeTaskId) sessionsRef.current.get(activeTaskId)?.xterm.focus();
        },
        write: (data: string | Uint8Array) => {
          if (activeTaskId) sessionsRef.current.get(activeTaskId)?.xterm.write(data);
        },
      }),
      [activeTaskId]
    );

    return (
      <div
        ref={panelRef}
        role="region"
        aria-label="Terminal"
        aria-hidden={!isOpen}
        inert={!isOpen || undefined}
        style={panelStyle}
        className={`relative shrink-0 border-t border-separator bg-background hidden sm:block ${
          isDragging ? '' : 'motion-safe:transition-[height] motion-safe:duration-300 ease-in-out'
        }`}
      >
        {isOpen && <div {...separatorProps} />}

        <div className="overflow-hidden h-full flex flex-col">
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-separator/50 h-10">
            <div className="flex items-center gap-2 text-xs text-muted font-medium">
              <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
              Terminal
            </div>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Close terminal"
              onPress={onClose}
              className="text-muted hover:text-foreground hover:bg-default w-11 h-11 sm:w-8 sm:h-8 min-w-0"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div ref={containerRef} tabIndex={isOpen ? 0 : -1} className="flex-1 min-h-0 px-1 py-1" />
        </div>
      </div>
    );
  }
);
