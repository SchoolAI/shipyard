#!/usr/bin/env bash
#
# Test harness for shipyard hook
# Simulates Claude Code hook events for local testing
#

# TODO: do we use this?
# TODO: we need MUCH better integration testing on the hook

set -e

HOOK_BIN="../dist/index.mjs"
SESSION_ID="test-session-$(date +%s)"

echo "🧪 Testing shipyard hook locally"
echo "Session ID: $SESSION_ID"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: EnterPlanMode (should create plan and open browser)
echo -e "${BLUE}Test 1: EnterPlanMode (plan creation)${NC}"
echo '{
  "session_id": "'"$SESSION_ID"'",
  "transcript_path": "/tmp/test-transcript.jsonl",
  "cwd": "/tmp/test-project",
  "permission_mode": "plan",
  "hook_event_name": "PreToolUse",
  "tool_name": "EnterPlanMode",
  "tool_input": {}
}' | node "$HOOK_BIN"
echo ""

# Wait a moment for plan to be created
sleep 2

# Test 2: Write to plan file (should update content)
echo -e "${BLUE}Test 2: Write plan content${NC}"
PLAN_CONTENT='# Test Implementation Plan

## Overview
This is a test plan for validating the hook integration.

## Steps
1. Step one - do something
2. Step two - do something else
3. Step three - finish up

## Success Criteria
- All tests pass
- Code is reviewed
'

echo '{
  "session_id": "'"$SESSION_ID"'",
  "permission_mode": "plan",
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/tmp/test-plan.md",
    "content": "'"$(echo "$PLAN_CONTENT" | sed 's/"/\\"/g' | tr '\n' ' ')"'"
  }
}' | node "$HOOK_BIN"
echo ""

# Test 3: Edit plan file (should update content)
echo -e "${BLUE}Test 3: Edit plan content${NC}"
echo '{
  "session_id": "'"$SESSION_ID"'",
  "permission_mode": "plan",
  "hook_event_name": "PreToolUse",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/tmp/test-plan.md",
    "new_string": "# Updated Test Plan\n\nThis content was updated via Edit tool."
  }
}' | node "$HOOK_BIN"
echo ""

# Test 4: ExitPlanMode (should check review status)
echo -e "${BLUE}Test 4: ExitPlanMode (should block - pending review)${NC}"
echo '{
  "session_id": "'"$SESSION_ID"'",
  "permission_mode": "plan",
  "hook_event_name": "PermissionRequest",
  "tool_name": "ExitPlanMode"
}' | node "$HOOK_BIN"
echo ""

# Test 5: Passthrough (not plan mode)
echo -e "${BLUE}Test 5: Passthrough (non-plan mode)${NC}"
echo '{
  "session_id": "'"$SESSION_ID"'",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": {}
}' | node "$HOOK_BIN"
echo ""

echo -e "${GREEN}✅ All tests complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Check the browser - a plan should have opened"
echo "2. Review the plan in the UI"
echo "3. Try approving it, then re-run Test 4 to see approval flow"
echo "4. Check ~/.shipyard/hook-state.json to see session state"
