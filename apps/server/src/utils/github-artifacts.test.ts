/**
 * Tests for GitHub artifacts upload functionality.
 * @see docs/whips/daemon-mcp-server-merge.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Mock logger before import */
vi.mock("./logger.js", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

/** Mock Octokit before import */
const mockOctokit = {
	repos: {
		getBranch: vi.fn(),
		get: vi.fn(),
		getContent: vi.fn(),
		createOrUpdateFileContents: vi.fn(),
	},
	git: {
		getRef: vi.fn(),
		createRef: vi.fn(),
	},
};

vi.mock("@octokit/rest", () => ({
	Octokit: vi.fn(() => mockOctokit),
}));

/** Import after mocks */
import {
	ensureArtifactsBranch,
	getOctokit,
	isGitHubConfigured,
	parseRepoString,
	uploadArtifact,
} from "./github-artifacts.js";

describe("GitHub Artifacts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		/** Reset environment */
		delete process.env.GITHUB_TOKEN;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("parseRepoString", () => {
		it("parses valid owner/repo format", () => {
			const result = parseRepoString("owner/repo");
			expect(result).toEqual({ owner: "owner", repoName: "repo" });
		});

		it("throws for invalid format (no slash)", () => {
			expect(() => parseRepoString("invalid")).toThrow("Invalid repo format");
		});

		it("throws for empty owner", () => {
			expect(() => parseRepoString("/repo")).toThrow("Invalid repo format");
		});

		it("throws for empty repo", () => {
			expect(() => parseRepoString("owner/")).toThrow("Invalid repo format");
		});

		it("throws for too many slashes", () => {
			expect(() => parseRepoString("owner/repo/extra")).toThrow(
				"Invalid repo format",
			);
		});
	});

	describe("isGitHubConfigured", () => {
		it("returns false when no token is set", () => {
			delete process.env.GITHUB_TOKEN;
			expect(isGitHubConfigured()).toBe(false);
		});

		it("returns true when GITHUB_TOKEN is set", () => {
			process.env.GITHUB_TOKEN = "test-token";
			expect(isGitHubConfigured()).toBe(true);
		});
	});

	describe("getOctokit", () => {
		it("returns null when no token is available", () => {
			delete process.env.GITHUB_TOKEN;
			expect(getOctokit()).toBeNull();
		});

		it("returns Octokit instance when token is set", () => {
			process.env.GITHUB_TOKEN = "test-token";
			const client = getOctokit();
			expect(client).toBeDefined();
		});
	});

	describe("ensureArtifactsBranch", () => {
		it("does nothing if branch already exists", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			mockOctokit.repos.getBranch.mockResolvedValue({ status: 200 });

			await ensureArtifactsBranch("owner/repo");

			expect(mockOctokit.repos.getBranch).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				branch: "plan-artifacts",
			});
			expect(mockOctokit.git.createRef).not.toHaveBeenCalled();
		});

		it("creates branch if it does not exist", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			const notFoundError = new Error("Not Found");
			(notFoundError as NodeJS.ErrnoException & { status: number }).status = 404;
			mockOctokit.repos.getBranch.mockRejectedValue(notFoundError);
			mockOctokit.repos.get.mockResolvedValue({
				data: { default_branch: "main" },
			});
			mockOctokit.git.getRef.mockResolvedValue({
				data: { object: { sha: "abc123" } },
			});
			mockOctokit.git.createRef.mockResolvedValue({ status: 201 });

			await ensureArtifactsBranch("owner/repo");

			expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				ref: "refs/heads/plan-artifacts",
				sha: "abc123",
			});
		});

		it("throws if no token is available", async () => {
			delete process.env.GITHUB_TOKEN;
			await expect(ensureArtifactsBranch("owner/repo")).rejects.toThrow(
				"GITHUB_TOKEN not set",
			);
		});
	});

	describe("uploadArtifact", () => {
		it("uploads new file to GitHub", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			mockOctokit.repos.getBranch.mockResolvedValue({ status: 200 });
			const notFoundError = new Error("Not Found");
			(notFoundError as NodeJS.ErrnoException & { status: number }).status = 404;
			mockOctokit.repos.getContent.mockRejectedValue(notFoundError);
			mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
				status: 201,
			});

			const url = await uploadArtifact({
				repo: "owner/repo",
				planId: "task-123",
				filename: "screenshot.png",
				content: "base64content",
			});

			expect(url).toBe(
				"https://raw.githubusercontent.com/owner/repo/plan-artifacts/plans/task-123/screenshot.png",
			);
			expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
				{
					owner: "owner",
					repo: "repo",
					path: "plans/task-123/screenshot.png",
					message: "Add artifact: screenshot.png",
					content: "base64content",
					branch: "plan-artifacts",
					sha: undefined,
				},
			);
		});

		it("updates existing file with SHA", async () => {
			process.env.GITHUB_TOKEN = "test-token";
			mockOctokit.repos.getBranch.mockResolvedValue({ status: 200 });
			mockOctokit.repos.getContent.mockResolvedValue({
				data: { type: "file", sha: "existing-sha" },
			});
			mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
				status: 200,
			});

			await uploadArtifact({
				repo: "owner/repo",
				planId: "task-123",
				filename: "screenshot.png",
				content: "base64content",
			});

			expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
				expect.objectContaining({
					sha: "existing-sha",
				}),
			);
		});

		it("throws if no token is available", async () => {
			delete process.env.GITHUB_TOKEN;
			await expect(
				uploadArtifact({
					repo: "owner/repo",
					planId: "task-123",
					filename: "screenshot.png",
					content: "base64content",
				}),
			).rejects.toThrow("GITHUB_TOKEN not set");
		});
	});
});
