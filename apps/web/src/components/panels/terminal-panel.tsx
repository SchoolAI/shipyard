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
  terminalChannel: RTCDataChannel | null;
  selectedEnvironmentPath: string | null;
}

export interface TerminalPanelHandle {
  focus: () => void;
  write: (data: string | Uint8Array) => void;
}

export const TerminalPanel = forwardRef<TerminalPanelHandle, TerminalPanelProps>(
  function TerminalPanel({ isOpen, onClose, terminalChannel, selectedEnvironmentPath }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wasOpenRef = useRef(false);
    const terminalChannelRef = useRef<RTCDataChannel | null>(null);
    terminalChannelRef.current = terminalChannel;

    const terminalPanelHeight = useUIStore((s) => s.terminalPanelHeight);
    const setTerminalPanelHeight = useUIStore((s) => s.setTerminalPanelHeight);

    const { panelRef, separatorProps, panelStyle, isDragging } =
      useVerticalResizablePanel<HTMLDivElement>({
        isOpen,
        height: terminalPanelHeight,
        onHeightChange: setTerminalPanelHeight,
      });

    const ensureTerminal = useCallback(() => {
      if (xtermRef.current || !containerRef.current) return;

      const fitAddon = new FitAddon();
      const terminal = new XTerm({
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

      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      requestAnimationFrame(() => fitAddon.fit());
    }, []);

    useEffect(() => {
      if (isOpen && !wasOpenRef.current) {
        ensureTerminal();
        requestAnimationFrame(() => fitAddonRef.current?.fit());
      }
      wasOpenRef.current = isOpen;
    }, [isOpen, ensureTerminal]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const observer = new ResizeObserver(() => {
        if (isOpen && fitAddonRef.current) {
          requestAnimationFrame(() => {
            fitAddonRef.current?.fit();
            const term = xtermRef.current;
            const ch = terminalChannelRef.current;
            if (term && ch) {
              sendResize(ch, term.cols, term.rows);
            }
          });
        }
      });

      observer.observe(container);
      return () => observer.disconnect();
    }, [isOpen]);

    useEffect(() => {
      const term = xtermRef.current;
      if (!terminalChannel || !term) return;

      const onMessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          term.write(event.data);
        } else {
          term.write(new Uint8Array(event.data));
        }
      };
      terminalChannel.addEventListener('message', onMessage);

      const onData = term.onData((data) => {
        if (terminalChannel.readyState === 'open') {
          terminalChannel.send(data);
        }
      });

      fitAddonRef.current?.fit();

      if (selectedEnvironmentPath && terminalChannel.readyState === 'open') {
        terminalChannel.send(
          CONTROL_PREFIX + JSON.stringify({ type: 'cwd', path: selectedEnvironmentPath })
        );
      }

      sendResize(terminalChannel, term.cols, term.rows);

      return () => {
        terminalChannel.removeEventListener('message', onMessage);
        onData.dispose();
      };
    }, [terminalChannel, isOpen, selectedEnvironmentPath]);

    useEffect(() => {
      return () => {
        xtermRef.current?.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => xtermRef.current?.focus(),
        write: (data: string | Uint8Array) => xtermRef.current?.write(data),
      }),
      []
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
