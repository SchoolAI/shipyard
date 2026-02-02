import { describe, expect, it } from "vitest";
import { createPlanWebUrl } from "./routes.js";

describe("createPlanWebUrl", () => {
	it("constructs URL with clean baseUrl", () => {
		const url = createPlanWebUrl("https://example.com", "abc123");
		expect(url).toBe("https://example.com/task/abc123");
	});

	it("removes trailing slash from baseUrl", () => {
		const url = createPlanWebUrl("https://example.com/", "abc123");
		expect(url).toBe("https://example.com/task/abc123");
	});

	it("handles baseUrl with subpath", () => {
		const url = createPlanWebUrl("https://example.com/shipyard", "abc123");
		expect(url).toBe("https://example.com/shipyard/task/abc123");
	});

	it("handles baseUrl with subpath and trailing slash", () => {
		const url = createPlanWebUrl("https://example.com/shipyard/", "abc123");
		expect(url).toBe("https://example.com/shipyard/task/abc123");
	});

	it("handles localhost URLs", () => {
		const url = createPlanWebUrl("http://localhost:5173", "abc123");
		expect(url).toBe("http://localhost:5173/task/abc123");
	});

	it("handles localhost URLs with trailing slash", () => {
		const url = createPlanWebUrl("http://localhost:5173/", "abc123");
		expect(url).toBe("http://localhost:5173/task/abc123");
	});

	it("handles baseUrl with query params (edge case)", () => {
		const url = createPlanWebUrl("https://example.com?foo=bar", "abc123");
		expect(url).toBe("https://example.com?foo=bar/task/abc123");
	});

	it("handles planId with special characters", () => {
		const url = createPlanWebUrl("https://example.com", "plan-id_123");
		expect(url).toBe("https://example.com/task/plan-id_123");
	});

	it("handles multiple trailing slashes (only removes last)", () => {
		const url = createPlanWebUrl("https://example.com///", "abc123");
		expect(url).toBe("https://example.com///task/abc123");
	});

	it("preserves port numbers", () => {
		const url = createPlanWebUrl("https://example.com:8080", "abc123");
		expect(url).toBe("https://example.com:8080/task/abc123");
	});

	it("preserves port numbers with trailing slash", () => {
		const url = createPlanWebUrl("https://example.com:8080/", "abc123");
		expect(url).toBe("https://example.com:8080/task/abc123");
	});
});
