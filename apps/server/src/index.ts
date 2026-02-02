/**
 * Unified MCP Server + Daemon for Shipyard
 *
 * Entry point that detects mode and starts appropriate services:
 * - MCP mode (default): stdio transport to Claude Code
 * - Daemon mode (--daemon): Background server with Loro sync
 *
 * @see docs/whips/daemon-mcp-server-merge.md
 */

// TODO: Import mode detection and startup logic
// TODO: Parse CLI args (--daemon flag)
// TODO: MCP mode: spawn daemon if not running, then stdio transport
// TODO: Daemon mode: start HTTP server, Loro adapters, event handlers

export async function main(): Promise<void> {
	// TODO: Implement mode detection and startup
	// const isDaemonMode = process.argv.includes('--daemon')
	// if (isDaemonMode) { await startDaemon() }
	// else { await startMcpClient() }
	throw new Error("Not implemented");
}

// TODO: Uncomment when ready to run
// main().catch(console.error)
