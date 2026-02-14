import { useEffect, useState } from 'react';

const STATUS_MESSAGES = ['Thinking...', 'Working...', 'Writing code...', 'Reviewing...'];

const CYCLE_INTERVAL_MS = 3000;

/**
 * ASCII Sailing Ship thinking/loading animation (v2).
 *
 * A tiny ASCII ship (`>=>`) sails across staggered tilde-wave lines in monospace
 * font, bouncing subtly as if riding waves. Three wave lines at decreasing opacity
 * create depth. A cycling status message fades below the waves.
 *
 * v2 fixes:
 *  - Ship stays within wave character bounds (percentage-based sail animation)
 *  - Subtle vertical bounce layered on horizontal movement
 *  - Multiple wave lines with staggered offsets and opacities
 *  - Cycling status text with opacity crossfade
 *
 * Accessibility: role="status" with aria-live="polite" announces text changes
 * to screen readers. All decorative elements hidden via aria-hidden. Motion
 * respects prefers-reduced-motion via motion-safe: prefix. Under reduced motion,
 * the ship stays centered with static "Thinking..." text.
 */
export function AsciiShipThinking() {
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
    <div className="py-1.5">
      <span className="sr-only" role="status" aria-live="polite">
        Agent status: {message}
      </span>

      {/* Wave scene container */}
      <div className="font-mono text-sm select-none" aria-hidden="true">
        {/* Top wave line — ship sails here */}
        <div className="relative overflow-hidden h-[1.5em] w-[13ch]">
          {/* Static wave characters */}
          <span className="text-secondary/40 motion-safe:animate-wave-shimmer">
            {'~~~~~~~~~~~~~~'}
          </span>

          {/* Ship — outer span sails horizontally, inner span bobs vertically */}
          <span className="absolute top-0 motion-safe:animate-sail motion-reduce:left-[calc(50%-1ch)]">
            <span className="text-accent motion-safe:animate-ship-bob inline-block">{'>=>'}</span>
          </span>
        </div>

        {/* Middle wave line — decorative depth, offset right */}
        <div className="overflow-hidden h-[1.3em] w-[13ch] -mt-0.5 pl-2">
          <span className="text-secondary/25 motion-safe:animate-wave-shimmer-delayed">
            {'~~~~~~~~~~~~'}
          </span>
        </div>

        {/* Bottom wave line — decorative depth, offset left */}
        <div className="overflow-hidden h-[1.3em] w-[13ch] -mt-0.5">
          <span className="text-secondary/15 motion-safe:animate-wave-shimmer-slow">
            {'~~~~~~~~~~'}
          </span>
        </div>
      </div>

      {/* Cycling status text with crossfade */}
      <span
        className="text-xs text-muted mt-0.5 block motion-safe:transition-opacity motion-safe:duration-300"
        aria-hidden="true"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {message}
      </span>
    </div>
  );
}
