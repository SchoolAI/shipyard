/**
 * Integration tests for git sync to Loro doc.
 *
 * Watches git for changes and pushes to changeSnapshots.
 * @see docs/whips/daemon-mcp-server-merge.md#git-sync-flow
 */

import { describe, it } from "vitest";

describe("Git Sync", () => {
	describe("getGitChanges", () => {
		it.todo("returns staged files from git diff --cached");
		it.todo("returns unstaged files from git diff");
		it.todo("returns untracked files from git ls-files --others");
		it.todo("includes correct status for each file");
		it.todo("includes patch content for changes");
		it.todo("calculates totalAdditions and totalDeletions");
		it.todo("returns current HEAD sha");
		it.todo("returns current branch name");
	});

	describe("startGitSync", () => {
		it.todo("starts periodic sync");
		it.todo("writes to changeSnapshots[machineId]");
		it.todo("includes machine metadata");
		it.todo("returns stop function");
		it.todo("stops syncing after stop called");
	});

	describe("readUntrackedFile", () => {
		it.todo("returns file content under size limit");
		it.todo("returns empty string for files over limit");
		it.todo("handles file not found");
		it.todo("respects maxSize parameter (default 100KB)");
	});
});
