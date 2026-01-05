import { useState } from 'react';

/**
 * Placeholder notification bell button.
 *
 * For now, just shows "Coming soon" tooltip on hover.
 * Will be implemented fully in a future milestone.
 */
export function NotificationsButton() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 relative"
        title="Notifications"
      >
        {/* Bell icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Notifications bell icon</title>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {/* Badge (always 0 for now) */}
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-slate-300 text-white text-xs rounded-full flex items-center justify-center">
          0
        </span>
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg whitespace-nowrap z-50">
          Coming soon
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45" />
        </div>
      )}
    </div>
  );
}
