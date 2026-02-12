import { ChevronDown, GitBranch, Globe, Shield } from 'lucide-react';

export function StatusBar() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-3">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            Default permissions
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            No environment
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <GitBranch className="w-3.5 h-3.5" />
          From main
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
