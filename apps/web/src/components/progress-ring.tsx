import { useMemo } from 'react';

interface ProgressRingProps {
  completed: number;
  total: number;
  size: number;
}

export function ProgressRing({ completed, total, size }: ProgressRingProps) {
  const strokeWidth = size >= 24 ? 3 : 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useMemo(() => (total > 0 ? completed / total : 0), [completed, total]);

  const offset = circumference * (1 - progress);
  const allDone = completed === total && total > 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-separator"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={`motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500 ${allDone ? 'text-success' : 'text-secondary'}`}
      />
    </svg>
  );
}
