import { PlanStatusValues } from '@shipyard/schema';
import { z } from 'zod';
import { registryConfig } from '../config/env/registry.js';
import { TOOL_NAMES } from './tool-names.js';

const SetupReviewNotificationInput = z.object({
  planId: z.string().describe('Plan ID to monitor'),
  pollIntervalSeconds: z
    .number()
    .optional()
    .default(30)
    .describe('Polling interval in seconds (default: 30)'),
});

export const setupReviewNotificationTool = {
  definition: {
    name: TOOL_NAMES.SETUP_REVIEW_NOTIFICATION,
    description: `Returns a bash script to monitor plan review status.

NOTE FOR CLAUDE CODE USERS: If you have the shipyard hook installed, you DON'T need this tool. The hook automatically blocks until the human approves or requests changes. This tool is only for agents WITHOUT hook support.

USAGE (for non-hook agents):
1. Call this tool to get monitoring script
2. Run script in background: bash <script> &
3. Script polls registry server for status changes
4. Exits when status becomes 'in_progress' (approved) or 'changes_requested' (needs work)

REQUIREMENTS: The script requires 'jq' for URL encoding. Install with: brew install jq (macOS) or apt install jq (Linux)`,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID to monitor' },
        pollIntervalSeconds: {
          type: 'number',
          description: 'Polling interval in seconds (default: 30)',
        },
      },
      required: ['planId'],
    },
  },

  handler: async (args: unknown) => {
    const input = SetupReviewNotificationInput.parse(args);
    const { planId, pollIntervalSeconds = 30 } = input;

    const registryPort = registryConfig.REGISTRY_PORT[0];
    const trpcUrl = `http://localhost:${registryPort}/trpc`;

    /** Use actual status enum values to ensure script stays in sync with schema */
    const statusInProgress = PlanStatusValues.find((s) => s === 'in_progress');
    const statusChangesRequested = PlanStatusValues.find((s) => s === 'changes_requested');

    if (!statusInProgress || !statusChangesRequested) {
      throw new Error('Required status values not found in PlanStatusValues');
    }

    /** Standard tRPC v10+ HTTP format (no superjson transformer) */
    const script = `#!/bin/bash
# Monitor plan "${planId}" for approval status changes
# Polls the Shipyard registry server and exits when approved/rejected

# Check for required dependency
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed."
  echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
  exit 1
fi

TRPC_URL="${trpcUrl}"
PLAN_ID="${planId}"
POLL_INTERVAL=${pollIntervalSeconds}

# Subscribe to status changes via tRPC mutation
echo "Subscribing to plan changes..."
RESPONSE=$(curl -sf -X POST "$TRPC_URL/subscription.create" \\
  -H "Content-Type: application/json" \\
  -d '{"planId":"'"$PLAN_ID"'","subscribe":["status","comments"],"windowMs":5000,"threshold":1}')

# Extract clientId from response: {"result":{"data":{"clientId":"..."}}}
CLIENT_ID=$(echo "$RESPONSE" | sed -n 's/.*"clientId":"\\([^"]*\\)".*/\\1/p')

if [ -z "$CLIENT_ID" ]; then
  echo "Failed to subscribe. Is the Shipyard registry server running?"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "Subscribed with clientId: $CLIENT_ID"
echo "Polling every $POLL_INTERVAL seconds..."

# Poll for changes via tRPC query (GET with url-encoded input)
while true; do
  sleep $POLL_INTERVAL

  # URL-encode the input JSON for GET request
  INPUT='{"planId":"'"$PLAN_ID"'","clientId":"'"$CLIENT_ID"'"}'
  ENCODED_INPUT=$(printf '%s' "$INPUT" | jq -sRr @uri)

  RESULT=$(curl -sf "$TRPC_URL/subscription.getChanges?input=$ENCODED_INPUT" 2>/dev/null)

  # Check if changes are ready: {"result":{"data":{"ready":true,"changes":"..."}}}
  if echo "$RESULT" | grep -q '"ready":true'; then
    CHANGES=$(echo "$RESULT" | sed -n 's/.*"changes":"\\([^"]*\\)".*/\\1/p')
    echo "Changes detected: $CHANGES"

    # Exit on status change to in_progress (approved) or changes_requested (needs work)
    if echo "$CHANGES" | grep -qE "Status:.*(${statusInProgress}|${statusChangesRequested})"; then
      echo "Plan status changed. Exiting."
      exit 0
    fi
  fi
done`;

    return {
      content: [
        {
          type: 'text',
          text: `Notification script for plan "${planId}":

\`\`\`bash
${script}
\`\`\`

**Usage:** Save to a file and run in background: \`bash script.sh &\`

The script:
- Subscribes to status/comment changes via tRPC
- Polls every ${pollIntervalSeconds} seconds
- Exits when status becomes in_progress (approved) or changes_requested (needs work)
- Requires \`jq\` for URL encoding (install: brew install jq)`,
        },
      ],
    };
  },
};
