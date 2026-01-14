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

NOTE FOR CLAUDE CODE USERS: If you have the peer-plan hook installed, you DON'T need this tool. The hook automatically blocks until the human approves or requests changes. This tool is only for agents WITHOUT hook support.

USAGE (for non-hook agents):
1. Call this tool to get monitoring script
2. Run script in background: bash <script> &
3. Script polls registry server for status changes
4. Exits when status becomes 'approved' or 'changes_requested'`,
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
    const baseUrl = `http://localhost:${registryPort}/api/plan/${encodeURIComponent(planId)}`;

    const script = `# Subscribe to status and comment changes
CLIENT_ID=$(curl -sf -X POST "${baseUrl}/subscribe" \\
  -H "Content-Type: application/json" \\
  -d '{"subscribe":["status","comments"],"windowMs":5000,"threshold":1}' \\
  | grep -o '"clientId":"[^"]*"' | cut -d'"' -f4)

echo "Subscribed. Monitoring plan..."

# Poll for changes
while sleep ${pollIntervalSeconds}; do
  result=$(curl -sf "${baseUrl}/changes?clientId=$CLIENT_ID" 2>/dev/null)
  ready=$(echo "$result" | grep -o '"ready":true')
  if [ -n "$ready" ]; then
    changes=$(echo "$result" | grep -o '"changes":"[^"]*"' | cut -d'"' -f4)
    echo "Changes: $changes"
    # Exit on status change to approved/changes_requested
    echo "$changes" | grep -qE "Status:.*(approved|changes_requested)" && exit 0
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

> Subscribes to status and comment changes with server-side batching.
> Batching: 5s window or 1 change threshold (whichever comes first).
> Exits when status becomes approved/changes_requested.
> Most agent environments support background bash notifications.`,
        },
      ],
    };
  },
};
