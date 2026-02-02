import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("serverConfig", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		vi.resetModules();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.resetModules();
	});

	describe("NODE_ENV", () => {
		it('should default to "development" when env var not set', async () => {
			delete process.env.NODE_ENV;

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.NODE_ENV).toBe("development");
		});

		it('should accept "development"', async () => {
			process.env.NODE_ENV = "development";

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.NODE_ENV).toBe("development");
		});

		it('should accept "test"', async () => {
			process.env.NODE_ENV = "test";

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.NODE_ENV).toBe("test");
		});

		it('should accept "production"', async () => {
			process.env.NODE_ENV = "production";

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.NODE_ENV).toBe("production");
		});

		it("should throw error for invalid value", async () => {
			process.env.NODE_ENV = "staging";

			await expect(async () => {
				await import("./server.js");
			}).rejects.toThrow("Environment variable validation failed");
		});

		it("should throw error for empty string", async () => {
			process.env.NODE_ENV = "";

			await expect(async () => {
				await import("./server.js");
			}).rejects.toThrow("Environment variable validation failed");
		});

		it("should throw error for numeric value", async () => {
			process.env.NODE_ENV = "123";

			await expect(async () => {
				await import("./server.js");
			}).rejects.toThrow("Environment variable validation failed");
		});

		it('should be case-sensitive (reject "DEVELOPMENT")', async () => {
			process.env.NODE_ENV = "DEVELOPMENT";

			await expect(async () => {
				await import("./server.js");
			}).rejects.toThrow("Environment variable validation failed");
		});
	});

	describe("LOG_LEVEL", () => {
		it('should default to "info" when env var not set', async () => {
			delete process.env.LOG_LEVEL;

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.LOG_LEVEL).toBe("info");
		});

		it('should accept "debug"', async () => {
			process.env.LOG_LEVEL = "debug";

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.LOG_LEVEL).toBe("debug");
		});

		it('should accept "info"', async () => {
			process.env.LOG_LEVEL = "info";

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.LOG_LEVEL).toBe("info");
		});

		it('should accept "warn"', async () => {
			process.env.LOG_LEVEL = "warn";

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.LOG_LEVEL).toBe("warn");
		});

		it('should accept "error"', async () => {
			process.env.LOG_LEVEL = "error";

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.LOG_LEVEL).toBe("error");
		});

		it("should throw error for invalid value", async () => {
			process.env.LOG_LEVEL = "trace";

			await expect(async () => {
				await import("./server.js");
			}).rejects.toThrow("Environment variable validation failed");
		});

		it("should throw error for empty string", async () => {
			process.env.LOG_LEVEL = "";

			await expect(async () => {
				await import("./server.js");
			}).rejects.toThrow("Environment variable validation failed");
		});

		it("should throw error for numeric value", async () => {
			process.env.LOG_LEVEL = "1";

			await expect(async () => {
				await import("./server.js");
			}).rejects.toThrow("Environment variable validation failed");
		});

		it('should be case-sensitive (reject "INFO")', async () => {
			process.env.LOG_LEVEL = "INFO";

			await expect(async () => {
				await import("./server.js");
			}).rejects.toThrow("Environment variable validation failed");
		});

		it("should reject common but invalid log levels", async () => {
			process.env.LOG_LEVEL = "verbose";

			await expect(async () => {
				await import("./server.js");
			}).rejects.toThrow("Environment variable validation failed");
		});
	});

	describe("combined validation", () => {
		it("should validate both NODE_ENV and LOG_LEVEL together", async () => {
			process.env.NODE_ENV = "production";
			process.env.LOG_LEVEL = "warn";

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.NODE_ENV).toBe("production");
			expect(serverConfig.LOG_LEVEL).toBe("warn");
		});

		it("should use defaults for both when neither is set", async () => {
			delete process.env.NODE_ENV;
			delete process.env.LOG_LEVEL;

			const { serverConfig } = await import("./server.js");

			expect(serverConfig.NODE_ENV).toBe("development");
			expect(serverConfig.LOG_LEVEL).toBe("info");
		});
	});
});
