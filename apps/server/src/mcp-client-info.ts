/**
 * Global storage for MCP client information.
 * Captured during MCP initialization handshake and used for platform detection.
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
