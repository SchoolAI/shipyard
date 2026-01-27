/**
 * Global storage for MCP client information.
 * Captured during MCP initialization handshake and used for platform detection.
 */

/**
 * Global storage for MCP clientInfo captured during first tool call.
 * REASON: MCP SDK only provides clientInfo after handshake completes,
 * but we need it when creating WebRTC providers. The SDK doesn't expose
 * clientInfo to individual tool handlers, so we capture it once globally.
 */
let clientInfoName: string | undefined;

/**
 * Store the MCP client name from the initialization handshake.
 * Called once when the MCP server connects to a client.
 */
export function setClientInfo(name: string | undefined): void {
  clientInfoName = name;
}

/**
 * Get the stored MCP client name.
 * Returns undefined if no client has connected yet.
 */
export function getClientInfo(): string | undefined {
  return clientInfoName;
}

/**
 * Reset client info (for testing and server lifecycle).
 * Clears the stored client name so detection can be re-run.
 */
export function resetClientInfo(): void {
  clientInfoName = undefined;
}
