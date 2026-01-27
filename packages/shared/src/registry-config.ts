/**
 * Default registry ports for shipyard hub discovery.
 * Multiple ports support hub restarts and parallel worktrees.
 * Range: 32191-32199 allows up to 9 concurrent instances.
 */
export const DEFAULT_REGISTRY_PORTS = [
  32191, 32192, 32193, 32194, 32195, 32196, 32197, 32198, 32199,
] as const;
