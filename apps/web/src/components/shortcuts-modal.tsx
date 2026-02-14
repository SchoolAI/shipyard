import { Kbd, Modal } from '@heroui/react';
import { HOTKEYS } from '../constants/hotkeys';
import { useUIStore } from '../stores';

interface DisplayShortcut {
  label: string;
  keys: string[];
  global: boolean;
}

function buildDisplayList(): { global: DisplayShortcut[]; navigation: DisplayShortcut[] } {
  const grouped = new Map<string, DisplayShortcut>();
  for (const h of Object.values(HOTKEYS)) {
    const existing = grouped.get(h.label);
    if (existing) {
      existing.keys.push(h.display);
    } else {
      grouped.set(h.label, { label: h.label, keys: [h.display], global: h.global });
    }
  }
  const all = [...grouped.values()];
  return {
    global: all.filter((s) => s.global),
    navigation: all.filter((s) => !s.global),
  };
}

const { global: globalShortcuts, navigation: navigationShortcuts } = buildDisplayList();

function ShortcutRow({ shortcut }: { shortcut: DisplayShortcut }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-foreground/80">{shortcut.label}</span>
      <span className="flex items-center gap-1 shrink-0 ml-4">
        {shortcut.keys.map((key, i) => (
          <span key={key} className="flex items-center gap-1">
            {i > 0 && <span className="text-xs text-muted/40">or</span>}
            <Kbd className="text-xs">{key}</Kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

function ShortcutSection({ title, shortcuts }: { title: string; shortcuts: DisplayShortcut[] }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-muted/60 mb-2">{title}</h3>
      <div className="space-y-0.5">
        {shortcuts.map((s) => (
          <ShortcutRow key={s.label} shortcut={s} />
        ))}
      </div>
    </div>
  );
}

export function ShortcutsModal() {
  const isOpen = useUIStore((s) => s.isShortcutsModalOpen);
  const setOpen = useUIStore((s) => s.setShortcutsModalOpen);

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={setOpen} isDismissable>
      <Modal.Container placement="center" size="lg">
        <Modal.Dialog>
          <div className="bg-overlay rounded-2xl p-6">
            <h2 className="text-base font-medium text-foreground mb-5">Keyboard shortcuts</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
              <ShortcutSection title="Global" shortcuts={globalShortcuts} />
              <ShortcutSection title="Navigation" shortcuts={navigationShortcuts} />
            </div>

            <p className="mt-5 text-xs text-muted/40 text-center">
              Press <Kbd className="text-xs">?</Kbd> to dismiss
            </p>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
