import { describe, expect, it } from 'vitest';
import {
  deriveParentRepoPath,
  extractBranchFromWorktreePath,
  isWorktreePath,
} from './worktree-helpers';

describe('isWorktreePath', () => {
  it('returns true for a standard worktree path', () => {
    expect(isWorktreePath('/Users/dev/my-project-wt/feature-auth')).toBe(true);
  });

  it('returns false for a normal repo path', () => {
    expect(isWorktreePath('/Users/dev/my-project')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isWorktreePath('')).toBe(false);
  });

  it('returns true when -wt/ appears mid-path', () => {
    expect(isWorktreePath('/home/user/shipyard-wt/worktree-support')).toBe(true);
  });
});

describe('extractBranchFromWorktreePath', () => {
  it('extracts the branch name after -wt/', () => {
    expect(extractBranchFromWorktreePath('/Users/dev/my-project-wt/feature-auth')).toBe(
      'feature-auth'
    );
  });

  it('extracts nested branch paths (slashes in branch name)', () => {
    expect(extractBranchFromWorktreePath('/Users/dev/my-project-wt/fix/login-bug')).toBe(
      'fix/login-bug'
    );
  });

  it('falls back to the last path segment when -wt/ is absent', () => {
    expect(extractBranchFromWorktreePath('/Users/dev/my-project')).toBe('my-project');
  });

  it('returns "unknown" for an empty string', () => {
    expect(extractBranchFromWorktreePath('')).toBe('unknown');
  });

  it('handles trailing slashes in the branch segment', () => {
    expect(extractBranchFromWorktreePath('/Users/dev/repo-wt/my-branch')).toBe('my-branch');
  });
});

describe('deriveParentRepoPath', () => {
  it('strips the worktree suffix to get the parent repo path', () => {
    expect(deriveParentRepoPath('/Users/dev/my-project-wt/feature-auth')).toBe(
      '/Users/dev/my-project'
    );
  });

  it('returns the path unchanged for non-worktree paths', () => {
    expect(deriveParentRepoPath('/Users/dev/my-project')).toBe('/Users/dev/my-project');
  });

  it('handles nested branch names correctly', () => {
    expect(deriveParentRepoPath('/Users/dev/repo-wt/fix/login-bug')).toBe('/Users/dev/repo');
  });

  it('strips trailing slashes from the derived parent', () => {
    expect(deriveParentRepoPath('/Users/dev/project-wt/branch')).toBe('/Users/dev/project');
  });
});
