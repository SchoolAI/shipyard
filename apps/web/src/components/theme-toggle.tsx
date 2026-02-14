import { Button, Tooltip } from '@heroui/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { Theme } from '../stores';
import { useUIStore } from '../stores';
import { assertNever } from '../utils/assert-never';

const THEME_CYCLE: Record<Theme, Theme> = {
  dark: 'light',
  light: 'system',
  system: 'dark',
};

function themeIcon(theme: Theme) {
  switch (theme) {
    case 'dark':
      return <Moon className="w-4 h-4" />;
    case 'light':
      return <Sun className="w-4 h-4" />;
    case 'system':
      return <Monitor className="w-4 h-4" />;
    default:
      return assertNever(theme);
  }
}

function themeLabel(theme: Theme): string {
  switch (theme) {
    case 'dark':
      return 'Dark mode';
    case 'light':
      return 'Light mode';
    case 'system':
      return 'System mode';
    default:
      return assertNever(theme);
  }
}

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={`${themeLabel(theme)}, click to switch`}
          className="text-muted hover:text-foreground hover:bg-default/50 w-8 h-8 min-w-0"
          onPress={() => setTheme(THEME_CYCLE[theme])}
        >
          {themeIcon(theme)}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top">{themeLabel(theme)}</Tooltip.Content>
    </Tooltip>
  );
}
