import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

describe("githubConfig", () => {
	const originalEnv = process.env;
	const mockExecSync = vi.mocked(execSync);

	beforeEach(() => {
		process.env = { ...originalEnv };
		mockExecSync.mockReset();
		vi.resetModules();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.resetModules();
	});

	describe("GITHUB_TOKEN", () => {
		it("should prioritize env var over CLI token", async () => {
			process.env.GITHUB_TOKEN = "env-token";
			mockExecSync.mockReturnValue("cli-token\n");

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.GITHUB_TOKEN).toBe("env-token");
		});

		it("should use CLI token when env var not set", async () => {
			delete process.env.GITHUB_TOKEN;
			mockExecSync.mockReturnValue("cli-token\n");

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.GITHUB_TOKEN).toBe("cli-token");
			expect(mockExecSync).toHaveBeenCalledWith("gh auth token", {
				encoding: "utf-8",
				timeout: 5000,
				stdio: ["pipe", "pipe", "pipe"],
			});
		});

		it("should return null when neither env var nor CLI available", async () => {
			delete process.env.GITHUB_TOKEN;
			mockExecSync.mockImplementation(() => {
				throw new Error("gh CLI not available");
			});

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.GITHUB_TOKEN).toBeNull();
		});

		it("should return null when CLI returns empty string", async () => {
			delete process.env.GITHUB_TOKEN;
			mockExecSync.mockReturnValue("");

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.GITHUB_TOKEN).toBeNull();
		});

		it("should return null when CLI returns whitespace", async () => {
			delete process.env.GITHUB_TOKEN;
			mockExecSync.mockReturnValue("  \n  ");

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.GITHUB_TOKEN).toBeNull();
		});

		it("should trim whitespace from CLI token", async () => {
			delete process.env.GITHUB_TOKEN;
			mockExecSync.mockReturnValue("  cli-token  \n");

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.GITHUB_TOKEN).toBe("cli-token");
		});

		it("should handle empty string in env var by falling back to CLI", async () => {
			process.env.GITHUB_TOKEN = "";
			mockExecSync.mockReturnValue("cli-token\n");

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.GITHUB_TOKEN).toBe("cli-token");
		});
	});

	describe("SHIPYARD_ARTIFACTS", () => {
		it("should default to true when env var not set", async () => {
			delete process.env.SHIPYARD_ARTIFACTS;

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(true);
		});

		it('should return false for "disabled"', async () => {
			process.env.SHIPYARD_ARTIFACTS = "disabled";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(false);
		});

		it('should return false for "DISABLED" (case-insensitive)', async () => {
			process.env.SHIPYARD_ARTIFACTS = "DISABLED";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(false);
		});

		it('should return false for "false"', async () => {
			process.env.SHIPYARD_ARTIFACTS = "false";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(false);
		});

		it('should return false for "FALSE" (case-insensitive)', async () => {
			process.env.SHIPYARD_ARTIFACTS = "FALSE";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(false);
		});

		it('should return false for "0"', async () => {
			process.env.SHIPYARD_ARTIFACTS = "0";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(false);
		});

		it('should return true for "enabled"', async () => {
			process.env.SHIPYARD_ARTIFACTS = "enabled";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(true);
		});

		it('should return true for "true"', async () => {
			process.env.SHIPYARD_ARTIFACTS = "true";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(true);
		});

		it('should return true for "1"', async () => {
			process.env.SHIPYARD_ARTIFACTS = "1";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(true);
		});

		it("should return true for any other value", async () => {
			process.env.SHIPYARD_ARTIFACTS = "random-value";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(true);
		});

		it("should return true for empty string", async () => {
			process.env.SHIPYARD_ARTIFACTS = "";

			const { githubConfig } = await import("./github.js");

			expect(githubConfig.SHIPYARD_ARTIFACTS).toBe(true);
		});
	});
});
