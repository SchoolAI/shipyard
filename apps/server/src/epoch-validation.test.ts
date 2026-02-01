import {
	DEFAULT_EPOCH,
	EPOCH_CLOSE_CODES,
	EPOCH_CLOSE_REASONS,
	getEpochFromMetadata,
	getPlanIndexMetadata,
	initPlanIndexMetadata,
	initPlanMetadata,
	isEpochValid,
} from "@shipyard/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

/**
 * Helper function that mirrors the URL parsing logic in handleWebSocketConnection.
 * Extracted here for unit testing without needing a real WebSocket server.
 */
function parseEpochFromUrl(
	url: string,
	defaultEpoch: number,
): { planId: string; clientEpoch: number } {
	const urlParts = url.split("?");
	const planId = urlParts[0]?.slice(1) || "default";

	let clientEpoch = defaultEpoch;
	if (urlParts[1]) {
		const params = new URLSearchParams(urlParts[1]);
		const epochParam = params.get("epoch");
		if (epochParam) {
			const parsed = Number.parseInt(epochParam, 10);
			if (!Number.isNaN(parsed)) {
				clientEpoch = parsed;
			}
		}
	}

	return { planId, clientEpoch };
}

describe("epoch validation", () => {
	describe("isEpochValid", () => {
		it("should return true when epoch equals minimum", () => {
			expect(isEpochValid(1, 1)).toBe(true);
		});

		it("should return true when epoch exceeds minimum", () => {
			expect(isEpochValid(5, 1)).toBe(true);
		});

		it("should return false when epoch is below minimum", () => {
			expect(isEpochValid(1, 2)).toBe(false);
		});
	});

	describe("getEpochFromMetadata", () => {
		it("should return epoch when present", () => {
			expect(getEpochFromMetadata({ epoch: 5 })).toBe(5);
		});

		it("should return DEFAULT_EPOCH when epoch is undefined", () => {
			expect(getEpochFromMetadata({})).toBe(DEFAULT_EPOCH);
		});
	});

	describe("initPlanMetadata with epoch", () => {
		it("should set epoch when provided", () => {
			const ydoc = new Y.Doc();
			initPlanMetadata(ydoc, { id: "test", title: "Test", epoch: 5 });
			const metadata = ydoc.getMap("metadata");
			expect(metadata.get("epoch")).toBe(5);
		});

		it("should default to DEFAULT_EPOCH when not provided", () => {
			const ydoc = new Y.Doc();
			initPlanMetadata(ydoc, { id: "test", title: "Test" });
			const metadata = ydoc.getMap("metadata");
			expect(metadata.get("epoch")).toBe(DEFAULT_EPOCH);
		});
	});

	describe("plan-index metadata", () => {
		it("should initialize plan-index metadata with epoch", () => {
			const ydoc = new Y.Doc();
			initPlanIndexMetadata(ydoc, { epoch: 5 });
			const metadata = getPlanIndexMetadata(ydoc);
			expect(metadata).not.toBeNull();
			expect(metadata?.id).toBe("plan-index");
			expect(metadata?.epoch).toBe(5);
			expect(metadata?.createdAt).toBeTypeOf("number");
			expect(metadata?.updatedAt).toBeTypeOf("number");
		});

		it("should default to DEFAULT_EPOCH when not provided", () => {
			const ydoc = new Y.Doc();
			initPlanIndexMetadata(ydoc);
			const metadata = getPlanIndexMetadata(ydoc);
			expect(metadata?.epoch).toBe(DEFAULT_EPOCH);
		});

		it("should return null if metadata is not plan-index", () => {
			const ydoc = new Y.Doc();
			initPlanMetadata(ydoc, { id: "test", title: "Test" });
			const metadata = getPlanIndexMetadata(ydoc);
			expect(metadata).toBeNull();
		});

		it("should return null if metadata is missing required fields", () => {
			const ydoc = new Y.Doc();
			const map = ydoc.getMap("metadata");
			map.set("id", "plan-index");
			const metadata = getPlanIndexMetadata(ydoc);
			expect(metadata).toBeNull();
		});
	});
});

describe("registryConfig MINIMUM_EPOCH", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		vi.resetModules();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.resetModules();
	});

	it("should default to DEFAULT_EPOCH when env var not set", async () => {
		delete process.env.MINIMUM_EPOCH;
		const { registryConfig } = await import("./config/env/registry.js");
		expect(registryConfig.MINIMUM_EPOCH).toBe(DEFAULT_EPOCH);
	});

	it("should parse valid integer from env var", async () => {
		process.env.MINIMUM_EPOCH = "5";
		const { registryConfig } = await import("./config/env/registry.js");
		expect(registryConfig.MINIMUM_EPOCH).toBe(5);
	});

	it("should throw on invalid number", async () => {
		process.env.MINIMUM_EPOCH = "not-a-number";
		await expect(async () => {
			await import("./config/env/registry.js");
		}).rejects.toThrow("MINIMUM_EPOCH must be a positive integer");
	});

	it("should throw on zero", async () => {
		process.env.MINIMUM_EPOCH = "0";
		await expect(async () => {
			await import("./config/env/registry.js");
		}).rejects.toThrow("MINIMUM_EPOCH must be a positive integer");
	});

	it("should throw on negative number", async () => {
		process.env.MINIMUM_EPOCH = "-1";
		await expect(async () => {
			await import("./config/env/registry.js");
		}).rejects.toThrow("MINIMUM_EPOCH must be a positive integer");
	});
});

describe("URL param epoch parsing", () => {
	it("should parse planId from simple URL", () => {
		const { planId, clientEpoch } = parseEpochFromUrl(
			"/my-plan-id",
			DEFAULT_EPOCH,
		);
		expect(planId).toBe("my-plan-id");
		expect(clientEpoch).toBe(DEFAULT_EPOCH);
	});

	it("should parse epoch from URL query param", () => {
		const { planId, clientEpoch } = parseEpochFromUrl(
			"/my-plan-id?epoch=5",
			DEFAULT_EPOCH,
		);
		expect(planId).toBe("my-plan-id");
		expect(clientEpoch).toBe(5);
	});

	it("should handle epoch=1 (old epoch)", () => {
		const { planId, clientEpoch } = parseEpochFromUrl(
			"/plan-index?epoch=1",
			DEFAULT_EPOCH,
		);
		expect(planId).toBe("plan-index");
		expect(clientEpoch).toBe(1);
	});

	it("should use default epoch when param is missing", () => {
		const { clientEpoch } = parseEpochFromUrl(
			"/test?other=value",
			DEFAULT_EPOCH,
		);
		expect(clientEpoch).toBe(DEFAULT_EPOCH);
	});

	it("should use default epoch when param is invalid", () => {
		const { clientEpoch } = parseEpochFromUrl(
			"/test?epoch=notanumber",
			DEFAULT_EPOCH,
		);
		expect(clientEpoch).toBe(DEFAULT_EPOCH);
	});

	it("should handle empty URL", () => {
		const { planId, clientEpoch } = parseEpochFromUrl("/", DEFAULT_EPOCH);
		expect(planId).toBe("default");
		expect(clientEpoch).toBe(DEFAULT_EPOCH);
	});

	it("should handle multiple query params", () => {
		const { planId, clientEpoch } = parseEpochFromUrl(
			"/my-plan?epoch=3&other=value",
			DEFAULT_EPOCH,
		);
		expect(planId).toBe("my-plan");
		expect(clientEpoch).toBe(3);
	});
});

describe("URL param epoch validation logic", () => {
	it("should reject connection when epoch is below minimum", () => {
		const { clientEpoch } = parseEpochFromUrl("/plan?epoch=1", DEFAULT_EPOCH);
		const minimumEpoch = 2;

		/** This is what handleWebSocketConnection does */
		const shouldReject = !isEpochValid(clientEpoch, minimumEpoch);
		expect(shouldReject).toBe(true);
	});

	it("should allow connection when epoch equals minimum", () => {
		const { clientEpoch } = parseEpochFromUrl("/plan?epoch=2", DEFAULT_EPOCH);
		const minimumEpoch = 2;

		const shouldReject = !isEpochValid(clientEpoch, minimumEpoch);
		expect(shouldReject).toBe(false);
	});

	it("should allow connection when epoch exceeds minimum", () => {
		const { clientEpoch } = parseEpochFromUrl("/plan?epoch=5", DEFAULT_EPOCH);
		const minimumEpoch = 2;

		const shouldReject = !isEpochValid(clientEpoch, minimumEpoch);
		expect(shouldReject).toBe(false);
	});

	it("should use correct close code and reason for epoch rejection", () => {
		expect(EPOCH_CLOSE_CODES.EPOCH_TOO_OLD).toBe(4100);
		expect(EPOCH_CLOSE_REASONS[EPOCH_CLOSE_CODES.EPOCH_TOO_OLD]).toBe(
			"epoch_too_old",
		);
	});
});
