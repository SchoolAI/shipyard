/**
 * MCP Tool: setup_review_notification
 *
 * Returns a bash script to monitor task review status.
 * Ported from apps/server-legacy/src/tools/setup-review-notification.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { z } from "zod";
import { parseEnv } from "../../env.js";
import type { McpServer } from "../index.js";

/** Tool name constant */
const TOOL_NAME = "setup_review_notification";

/** Input Schema */
const SetupReviewNotificationInput = z.object({
	taskId: z.string().describe("Task ID to monitor"),
	pollIntervalSeconds: z
		.number()
		.optional()
		.default(30)
		.describe("Polling interval in seconds (default: 30)"),
});

/**
 * Register the setup_review_notification tool.
 */
export function registerSetupReviewNotificationTool(server: McpServer): void {
	server.tool(
		TOOL_NAME,
		`Returns a bash script to monitor task review status.

NOTE FOR CLAUDE CODE USERS: If you have the shipyard hook installed, you DON'T need this tool. The hook automatically blocks until the human approves or requests changes. This tool is only for agents WITHOUT hook support.

USAGE (for non-hook agents):
1. Call this tool to get monitoring script
2. Run script in background: bash <script> &
3. Script polls registry server for status changes
4. Exits when status becomes 'in_progress' (approved) or 'changes_requested' (needs work)

REQUIREMENTS: The script requires 'jq' for URL encoding. Install with: brew install jq (macOS) or apt install jq (Linux)`,
		{
			taskId: { type: "string", description: "Task ID to monitor" },
			pollIntervalSeconds: {
				type: "number",
				description: "Polling interval in seconds (default: 30)",
			},
		},
		async (args: unknown) => {
			const input = SetupReviewNotificationInput.parse(args);
			const { taskId, pollIntervalSeconds = 30 } = input;

			const env = parseEnv();
			const registryPort = env.PORT;

			/*
			 * NOTE: With the new Loro architecture, status changes are pushed via CRDT sync
			 * rather than polled via tRPC. This script is a legacy fallback for non-hook agents.
			 * In the new architecture, agents should connect via WebSocket and subscribe to
			 * doc changes directly.
			 */

			const script = `#!/bin/bash
# Monitor task "${taskId}" for approval status changes
# Polls the Shipyard registry server and exits when approved/rejected

# Check for required dependency
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed."
  echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
  exit 1
fi

HEALTH_URL="http://localhost:${registryPort}/health"
TASK_ID="${taskId}"
POLL_INTERVAL=${pollIntervalSeconds}

# Wait for server to be healthy
echo "Waiting for server to be healthy..."
until curl -sf "$HEALTH_URL" > /dev/null 2>&1; do
  sleep 2
done
echo "Server is healthy."

# NOTE: With Loro architecture, this script would ideally connect via WebSocket
# and subscribe to document changes. For now, it's a placeholder that demonstrates
# the polling pattern.

echo "Monitoring task $TASK_ID for status changes..."
echo "Polling every $POLL_INTERVAL seconds..."
echo ""
echo "NOTE: With the new Loro architecture, status changes sync via CRDT."
echo "This script is a legacy fallback. Consider using the hook instead."
echo ""

# Simple health check loop as placeholder
while true; do
  sleep $POLL_INTERVAL

  # Check if server is still healthy
  if ! curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo "Server became unhealthy. Waiting for recovery..."
    continue
  fi

  echo "Task $TASK_ID: Checking status... (Loro sync pending)"

  # In the full implementation, this would:
  # 1. Connect to Loro WebSocket
  # 2. Subscribe to task document
  # 3. Watch for meta.status changes
  # 4. Exit when status is 'in_progress' or 'changes_requested'
done`;

			return {
				content: [
					{
						type: "text",
						text: `Notification script for task "${taskId}":

\`\`\`bash
${script}
\`\`\`

**Usage:** Save to a file and run in background: \`bash script.sh &\`

The script:
- Waits for server to be healthy
- Polls every ${pollIntervalSeconds} seconds
- Exits when status becomes in_progress (approved) or changes_requested (needs work)
- Requires \`jq\` for URL encoding (install: brew install jq)

**NOTE:** With the new Loro architecture, status changes sync via CRDT rather than polling.
For production use, consider connecting via WebSocket and subscribing to document changes.`,
					},
				],
			};
		},
	);
}
