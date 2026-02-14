import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Settings"
      tabIndex={-1}
      className="flex-1 overflow-y-auto outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onBack();
        }
      }}
    >
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-8">
          <button
            type="button"
            aria-label="Back to chat"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-foreground hover:bg-default/30 transition-colors"
            onClick={onBack}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-semibold text-foreground">Settings</h2>
        </div>

        <p className="text-sm text-muted">Settings will appear here.</p>
      </div>
    </div>
  );
}
