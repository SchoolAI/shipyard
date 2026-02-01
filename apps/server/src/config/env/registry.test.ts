import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("registryConfig", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		vi.resetModules();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.resetModules();
	});

	describe("REGISTRY_PORT", () => {
		it("should return default ports [32191-32199] when env var not set", async () => {
			delete process.env.REGISTRY_PORT;

			const { registryConfig } = await import("./registry.js");

			expect(registryConfig.REGISTRY_PORT).toEqual([
				32191, 32192, 32193, 32194, 32195, 32196, 32197, 32198, 32199,
			]);
		});

		it("should return single port array when env var is set to valid number", async () => {
			process.env.REGISTRY_PORT = "32193";

			const { registryConfig } = await import("./registry.js");

			expect(registryConfig.REGISTRY_PORT).toEqual([32193]);
		});

		it("should throw error when env var is invalid number", async () => {
			process.env.REGISTRY_PORT = "not-a-number";

			await expect(async () => {
				await import("./registry.js");
			}).rejects.toThrow(
				"REGISTRY_PORT must be a valid number, got: not-a-number",
			);
		});

		it("should throw error when env var is empty string", async () => {
			process.env.REGISTRY_PORT = "";

			const { registryConfig } = await import("./registry.js");

			expect(registryConfig.REGISTRY_PORT).toEqual([
				32191, 32192, 32193, 32194, 32195, 32196, 32197, 32198, 32199,
			]);
		});

		it("should handle port 0", async () => {
			process.env.REGISTRY_PORT = "0";

			const { registryConfig } = await import("./registry.js");

			expect(registryConfig.REGISTRY_PORT).toEqual([0]);
		});

		it("should handle large port numbers", async () => {
			process.env.REGISTRY_PORT = "65535";

			const { registryConfig } = await import("./registry.js");

			expect(registryConfig.REGISTRY_PORT).toEqual([65535]);
		});
	});

	describe("SHIPYARD_STATE_DIR", () => {
		it("should default to ~/.shipyard when env var not set", async () => {
			delete process.env.SHIPYARD_STATE_DIR;

			const { registryConfig } = await import("./registry.js");

			expect(registryConfig.SHIPYARD_STATE_DIR).toBe(
				join(homedir(), ".shipyard"),
			);
		});

		it("should use env var value when set", async () => {
			process.env.SHIPYARD_STATE_DIR = "/custom/path";

			const { registryConfig } = await import("./registry.js");

			expect(registryConfig.SHIPYARD_STATE_DIR).toBe("/custom/path");
		});

		it("should fall back to default when env var is empty string", async () => {
			process.env.SHIPYARD_STATE_DIR = "";

			const { registryConfig } = await import("./registry.js");

			expect(registryConfig.SHIPYARD_STATE_DIR).toBe(
				join(homedir(), ".shipyard"),
			);
		});

		it("should handle relative paths", async () => {
			process.env.SHIPYARD_STATE_DIR = "./relative/path";

			const { registryConfig } = await import("./registry.js");

			expect(registryConfig.SHIPYARD_STATE_DIR).toBe("./relative/path");
		});
	});
});
