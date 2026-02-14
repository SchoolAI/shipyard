import { useEffect, useState } from 'react';

const STATUS_MESSAGES = ['Thinking...', 'Working...', 'Writing code...', 'Reviewing...'];

const CYCLE_INTERVAL_MS = 3000;

/**
 * Pulsing Ring thinking/loading animation.
 *
 * A 16px teal ring with a conic-gradient sweep paired with rotating status
 * text that cycles every 3 seconds with an opacity crossfade.
 *
 * Accessibility: `role="status"` with `aria-live="polite"` announces text
 * changes to screen readers. The decorative ring is hidden via `aria-hidden`.
 * Reduced-motion users see a static teal circle with fixed "Working..." text.
 */
export function PulsingRingThinking() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let fadeTimer: ReturnType<typeof setTimeout>;

    const id = setInterval(() => {
      setVisible(false);

      fadeTimer = setTimeout(() => {
        setIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
        setVisible(true);
      }, 300);
    }, CYCLE_INTERVAL_MS);

    return () => {
      clearInterval(id);
      clearTimeout(fadeTimer);
    };
  }, []);

  const message = STATUS_MESSAGES[index] ?? STATUS_MESSAGES[0];

  return (
    <div className="inline-flex items-center gap-2 h-5">
      {/* Decorative ring with conic-gradient sweep */}
      <div className="relative size-4 shrink-0 motion-reduce:opacity-60" aria-hidden="true">
        <div className="absolute inset-0 rounded-full bg-secondary/30 motion-reduce:bg-secondary/50" />
        <div className="absolute inset-0 rounded-full ring-sweep-gradient motion-safe:animate-ring-sweep motion-reduce:hidden" />
      </div>

      {/* Status text with crossfade */}
      <span
        role="status"
        aria-live="polite"
        className="text-xs text-muted motion-safe:transition-opacity motion-safe:duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <span className="sr-only">Agent status: </span>
        {message}
      </span>
    </div>
  );
}
