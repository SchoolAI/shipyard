import { Toaster } from 'sonner';
import { useTheme } from '@/hooks/use-theme';

export function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />;
}
