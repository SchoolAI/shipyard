# Local Changes Test Setup - Complete

## Server Status

**Registry Server Running:**
- PID: 61154
- Started: 8:36PM (2026-01-23)
- Port: 32191 (registry hub)
- Status: Healthy (MCP server started successfully)
- Log location: /private/tmp/claude/-Users-jacobpetterle-Working-Directory-shipyard-wt-105-local-changes/tasks/b8ad42f.output

## Test Files Created

### Staged Changes (ready to commit)
1. **test-config.json** (16 lines, JSON)
   - Configuration for test scenarios
   - Defines expected behaviors and performance thresholds

2. **test-file-new.md** (14 lines, Markdown)
   - Documentation test file
   - Tests markdown rendering in plan context

3. **test-utils.ts** (22 lines, TypeScript)
   - Utility functions for test validation
   - Includes TypeScript interfaces and functions

**Total staged:** 3 files, 52 insertions

### Unstaged Changes (modified but not staged)
1. **README.md** (2 lines added)
   - Added HTML comment marker for testing
   - Tests detection of modifications to tracked files

2. **apps/hook/dist/index.js** (60 lines changed)
   - Build artifact modifications
   - Tests handling of generated code changes

**Total unstaged:** 2 files, 57 insertions, 5 deletions

### Untracked Files
- test-plan-request.json (test plan specification)

## Current Git Status

```
Branch: 105-local-changes
Behind origin/main: 7 commits

Changes to be committed:
  - new file:   test-config.json
  - new file:   test-file-new.md
  - new file:   test-utils.ts

Changes not staged for commit:
  - modified:   README.md
  - modified:   apps/hook/dist/index.js

Untracked files:
  - test-plan-request.json
```

## Next Steps

### 1. Create Test Plan via MCP

Use the `create_plan` MCP tool with this specification:

```
Title: Validate Local Changes Feature

Description: Test plan to validate that the local changes feature properly detects and displays uncommitted file changes in worktrees.

## Objectives

1. Verify git status detection works correctly
2. Confirm staged vs unstaged changes are differentiated
3. Test display of file changes in plan context
4. Validate performance with multiple changed files

## Test Scenarios

### Scenario 1: Staged Changes
- Create new file and stage it ✓ (done)
- Modify existing file and stage it ✓ (done)
- Verify changes appear in plan context

### Scenario 2: Unstaged Changes
- Modify files without staging ✓ (done)
- Verify changes are detected
- Confirm diff is readable

### Scenario 3: Mixed State
- Some files staged, some unstaged ✓ (done)
- Verify both categories are shown
- Test with various file types (TS, JSON, MD) ✓ (done)

### Scenario 4: No Changes
- Clean working tree (test after committing)
- Verify no false positives
- Confirm plan creation still works

## Success Criteria

- All git changes detected accurately
- Performance under 500ms for status check
- Clear differentiation between staged/unstaged
- No crashes with large diffs
- Graceful handling of binary files
```

### 2. Verify Local Changes Appear in Plan

Once the plan is created, check that the plan context includes:
- List of staged files (test-config.json, test-file-new.md, test-utils.ts)
- List of unstaged files (README.md, apps/hook/dist/index.js)
- Diffs for modified files
- Performance metrics for git operations

### 3. Test File Paths

All test files are located at:
- /Users/jacobpetterle/Working Directory/shipyard-wt/105-local-changes/test-config.json
- /Users/jacobpetterle/Working Directory/shipyard-wt/105-local-changes/test-file-new.md
- /Users/jacobpetterle/Working Directory/shipyard-wt/105-local-changes/test-utils.ts
- /Users/jacobpetterle/Working Directory/shipyard-wt/105-local-changes/README.md (modified)
- /Users/jacobpetterle/Working Directory/shipyard-wt/105-local-changes/test-plan-request.json (untracked)

### 4. Clean Up After Testing

```bash
# Unstage all files
git restore --staged test-config.json test-file-new.md test-utils.ts

# Remove test files
rm test-config.json test-file-new.md test-utils.ts test-plan-request.json

# Restore modified files
git restore README.md

# Note: apps/hook/dist/index.js may need to be regenerated via build
```

## Test Plan Creation Command

Since I cannot directly invoke MCP tools from bash, please use Claude Code to create the plan:

```
Please create a test plan titled "Validate Local Changes Feature" with the description and scenarios defined above.
```

The plan should automatically detect and include all the local changes we've created in its context.

---

**Setup completed:** 2026-01-23 20:45PM
**Ready for testing:** Yes
**Server healthy:** Yes
**Test files ready:** Yes (mixed staged/unstaged state)
