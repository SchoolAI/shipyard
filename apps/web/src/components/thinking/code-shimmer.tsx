/**
 * Code Shimmer thinking/loading animation.
 *
 * 3-4 skeleton placeholder lines of varying width with a shimmer gradient
 * sweeping left-to-right. Looks like code about to appear, setting
 * expectations for incoming content.
 *
 * Accessibility: role="status" announces to screen readers, decorative
 * bar elements are hidden via aria-hidden, and all motion respects
 * prefers-reduced-motion via the motion-safe: prefix. When reduced motion
 * is preferred, bars display as static at 40% opacity (the global
 * reduced-motion rule in app.css kills all animation durations).
 */

const BAR_WIDTHS = ['70%', '40%', '85%', '55%'];

export function CodeShimmerThinking() {
  return (
    <div className="py-1.5 space-y-2" role="status">
      <span className="sr-only">Agent is thinking</span>
      {BAR_WIDTHS.map((width, i) => (
        <div
          key={i}
          className="h-1 rounded-sm motion-safe:animate-shimmer motion-reduce:opacity-40"
          style={{
            width,
            animationDelay: `${i * 150}ms`,
            background: `linear-gradient(110deg, var(--color-surface) 0%, var(--color-secondary) 20%, var(--color-surface) 40%)`,
            backgroundSize: '200% 100%',
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
