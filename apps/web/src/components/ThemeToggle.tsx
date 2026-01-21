import { Button, Dropdown, Label } from '@heroui/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // Dynamic icon based on current theme
  const getCurrentIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="w-4 h-4" />;
      case 'dark':
        return <Moon className="w-4 h-4" />;
      case 'system':
        return <Monitor className="w-4 h-4" />;
    }
  };

  const themeLabels = {
    light: 'Light mode',
    dark: 'Dark mode',
    system: 'System theme',
  };

  return (
    <Dropdown>
      <Button isIconOnly variant="ghost" size="sm" aria-label={`Theme: ${themeLabels[theme]}`}>
        {getCurrentIcon()}
      </Button>
      <Dropdown.Popover placement="top">
        <Dropdown.Menu
          selectionMode="single"
          selectedKeys={new Set([theme])}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as string;
            if (selected === 'light' || selected === 'dark' || selected === 'system') {
              setTheme(selected);
            }
          }}
          aria-label="Theme selection"
        >
          <Dropdown.Item id="light" textValue="Light mode">
            <Sun className="w-4 h-4 shrink-0" />
            <Label>Light</Label>
            <Dropdown.ItemIndicator type="dot" />
          </Dropdown.Item>
          <Dropdown.Item id="system" textValue="System theme">
            <Monitor className="w-4 h-4 shrink-0" />
            <Label>System</Label>
            <Dropdown.ItemIndicator type="dot" />
          </Dropdown.Item>
          <Dropdown.Item id="dark" textValue="Dark mode">
            <Moon className="w-4 h-4 shrink-0" />
            <Label>Dark</Label>
            <Dropdown.ItemIndicator type="dot" />
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
