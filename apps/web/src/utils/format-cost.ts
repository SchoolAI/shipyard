export function formatCostUsd(costUsd: number | null | undefined): string | null {
  if (costUsd == null || !Number.isFinite(costUsd) || costUsd <= 0) return null;
  if (costUsd >= 0.01) return `$${costUsd.toFixed(2)}`;
  return `$${costUsd.toFixed(4)}`;
}
