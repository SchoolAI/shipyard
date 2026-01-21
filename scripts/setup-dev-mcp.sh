#!/bin/bash
# Setup shipyard-dev MCP server for local development
#
# This adds shipyard-dev to your ~/.claude.json so you can use the local
# build when developing. The plugin's .mcp.json only contains the npx version
# for end users, so developers need this separate config.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLAUDE_CONFIG="$HOME/.claude.json"

echo "Setting up shipyard-dev MCP server for local development..."
echo "Repository root: $REPO_ROOT"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed."
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

# Check if ~/.claude.json exists
if [ ! -f "$CLAUDE_CONFIG" ]; then
    echo "Error: $CLAUDE_CONFIG not found. Is Claude Code installed?"
    exit 1
fi

# Check if the server is built
if [ ! -f "$REPO_ROOT/apps/server/dist/index.js" ]; then
    echo "Server not built. Building now..."
    cd "$REPO_ROOT"
    pnpm build --filter @shipyard/server
fi

# Add shipyard-dev to mcpServers
echo "Adding shipyard-dev to $CLAUDE_CONFIG..."

jq --arg path "$REPO_ROOT/apps/server/dist/index.js" '.mcpServers["shipyard-dev"] = {
  "type": "stdio",
  "command": "node",
  "args": [$path],
  "env": {
    "NODE_ENV": "development",
    "LOG_LEVEL": "debug"
  }
}' "$CLAUDE_CONFIG" > /tmp/claude.json.tmp && mv /tmp/claude.json.tmp "$CLAUDE_CONFIG"

echo ""
echo "✅ Done! shipyard-dev MCP server added to your Claude Code config."
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code to pick up the new MCP server"
echo "  2. Run '/mcp' to verify shipyard-dev is listed"
echo "  3. Enable it if needed"
echo ""
echo "Note: The plugin's .mcp.json uses npx for end users."
echo "      This script adds the local build for development only."
