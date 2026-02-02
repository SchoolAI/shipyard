import { describe, expect, it } from "vitest";
import {
	DEFAULT_EPOCH,
	getEpochFromMetadata,
	isEpochValid,
	parseWebSocketUrl,
} from "./epoch.js";

describe("epoch utilities", () => {
	describe("isEpochValid", () => {
		it("returns true when epoch equals minimum", () => {
			expect(isEpochValid(2, 2)).toBe(true);
		});

		it("returns true when epoch exceeds minimum", () => {
			expect(isEpochValid(5, 2)).toBe(true);
		});

		it("returns false when epoch is below minimum", () => {
			expect(isEpochValid(1, 2)).toBe(false);
		});
	});

	describe("getEpochFromMetadata", () => {
		it("returns epoch when present", () => {
			expect(getEpochFromMetadata({ epoch: 5 })).toBe(5);
		});

		it("returns DEFAULT_EPOCH when epoch is undefined", () => {
			expect(getEpochFromMetadata({})).toBe(DEFAULT_EPOCH);
		});
	});

	describe("parseWebSocketUrl", () => {
		it("extracts planId from simple path", () => {
			const result = parseWebSocketUrl("/my-plan-id");
			expect(result.docName).toBe("my-plan-id");
			expect(result.clientEpoch).toBeNull();
		});

		it("extracts planId and epoch from path with query param", () => {
			const result = parseWebSocketUrl("/my-plan-id?epoch=2");
			expect(result.docName).toBe("my-plan-id");
			expect(result.clientEpoch).toBe(2);
		});

		it("handles plan-index document name", () => {
			const result = parseWebSocketUrl("/plan-index?epoch=2");
			expect(result.docName).toBe("plan-index");
			expect(result.clientEpoch).toBe(2);
		});

		it("returns default docName for empty path", () => {
			const result = parseWebSocketUrl("");
			expect(result.docName).toBe("default");
			expect(result.clientEpoch).toBeNull();
		});

		it("returns default docName for root path", () => {
			const result = parseWebSocketUrl("/");
			expect(result.docName).toBe("default");
			expect(result.clientEpoch).toBeNull();
		});

		it("handles multiple query params", () => {
			const result = parseWebSocketUrl("/planId?epoch=3&other=value");
			expect(result.docName).toBe("planId");
			expect(result.clientEpoch).toBe(3);
		});

		it("returns null epoch for invalid epoch value", () => {
			const result = parseWebSocketUrl("/planId?epoch=invalid");
			expect(result.docName).toBe("planId");
			expect(result.clientEpoch).toBeNull();
		});

		it("handles epoch without leading slash", () => {
			const result = parseWebSocketUrl("planId?epoch=2");
			expect(result.docName).toBe("planId");
			expect(result.clientEpoch).toBe(2);
		});

		/**
		 * This is the critical test case - the bug that caused "Task Not Found".
		 * Without proper parsing, the docName would be "planId?epoch=2".
		 */
		it("does NOT include query params in docName (regression test)", () => {
			const result = parseWebSocketUrl("/abc123?epoch=2");
			expect(result.docName).toBe("abc123");
			expect(result.docName).not.toContain("?");
			expect(result.docName).not.toContain("epoch");
		});
	});
});
