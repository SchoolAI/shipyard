/**
 * Wave Pulse thinking/loading animation.
 *
 * Three horizontal teal wave lines that undulate with staggered timing,
 * evoking ocean waves rippling. Designed as a drop-in replacement for
 * ThinkingDots in the chat UI.
 *
 * Accessibility: role="status" announces to screen readers, decorative
 * wave elements are hidden via aria-hidden, and all motion respects
 * prefers-reduced-motion via the motion-safe: prefix.
 */

interface WaveStyle extends React.CSSProperties {
  '--wave-opacity': string;
}

const wave1: WaveStyle = { width: '2rem', '--wave-opacity': '0.6', animationDelay: '0ms' };
const wave2: WaveStyle = { width: '2.5rem', '--wave-opacity': '0.4', animationDelay: '200ms' };
const wave3: WaveStyle = { width: '1.75rem', '--wave-opacity': '0.25', animationDelay: '400ms' };

export function WavePulseThinking() {
  return (
    <div className="flex flex-col items-start gap-1.5 py-1" role="status">
      <span className="sr-only">Agent is thinking</span>

      <div className="flex flex-col gap-1" aria-hidden="true">
        <span
          className="h-[2px] rounded-full bg-secondary motion-safe:animate-wave-pulse"
          style={wave1}
        />
        <span
          className="ml-2 h-[2px] rounded-full bg-secondary motion-safe:animate-wave-pulse"
          style={wave2}
        />
        <span
          className="h-[2px] rounded-full bg-secondary motion-safe:animate-wave-pulse"
          style={wave3}
        />
      </div>

      <span className="text-xs text-muted">Thinking...</span>
    </div>
  );
}
