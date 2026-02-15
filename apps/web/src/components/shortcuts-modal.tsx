import { Kbd, Modal } from '@heroui/react';
import { HOTKEYS, type HotkeyContext } from '../constants/hotkeys';
import { useUIStore } from '../stores';

interface DisplayShortcut {
  label: string;
  keys: string[];
  context: HotkeyContext;
}

const CONTEXT_LABELS: Record<HotkeyContext, string> = {
  global: 'Global',
  navigation: 'Navigation',
  composer: 'Composer',
};

const CONTEXT_DESCRIPTIONS: Record<HotkeyContext, string> = {
  global: 'Active everywhere, including form inputs',
  navigation: 'Active when not typing in an input',
  composer: 'Active when the message composer is focused',
};

function buildDisplayList(): Record<HotkeyContext, DisplayShortcut[]> {
  const grouped = new Map<string, DisplayShortcut>();
  for (const h of Object.values(HOTKEYS)) {
    const groupKey = `${h.context}:${h.label}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.keys.push(h.display);
    } else {
      grouped.set(groupKey, { label: h.label, keys: [h.display], context: h.context });
    }
  }
  const all = [...grouped.values()];
  return {
    global: all.filter((s) => s.context === 'global'),
    navigation: all.filter((s) => s.context === 'navigation'),
    composer: all.filter((s) => s.context === 'composer'),
  };
}

const sections = buildDisplayList();

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

function ShortcutSection({
  context,
  shortcuts,
}: {
  context: HotkeyContext;
  shortcuts: DisplayShortcut[];
}) {
  if (shortcuts.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-medium text-muted/60 mb-0.5">{CONTEXT_LABELS[context]}</h3>
      <p className="text-[10px] text-muted/40 mb-2">{CONTEXT_DESCRIPTIONS[context]}</p>
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
        <Modal.Dialog aria-labelledby="shortcuts-dialog-title">
          <div className="bg-overlay rounded-xl p-6">
            <h2 className="text-base font-medium text-foreground mb-5" id="shortcuts-dialog-title">
              Keyboard shortcuts
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
              <div className="space-y-5">
                <ShortcutSection context="global" shortcuts={sections.global} />
                <ShortcutSection context="composer" shortcuts={sections.composer} />
              </div>
              <ShortcutSection context="navigation" shortcuts={sections.navigation} />
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
