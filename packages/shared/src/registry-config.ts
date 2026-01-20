/**
 * Default registry ports for shipyard hub discovery.
 * Multiple ports support hub restarts - new instances use next available port.
 */
export const DEFAULT_REGISTRY_PORTS = [32191, 32192] as const;
