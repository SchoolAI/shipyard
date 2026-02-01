import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "./index";

describe("GET /health", () => {
	it("returns 200 with correct JSON structure", async () => {
		const res = await app.request("/health", {}, env);

		expect(res.status).toBe(200);

		const json = await res.json();
		expect(json).toEqual({
			status: "ok",
			service: "shipyard-signaling",
			environment: env.ENVIRONMENT,
		});
	});

	it("includes environment in response", async () => {
		const res = await app.request("/health", {}, env);
		const json = await res.json();

		expect(json.environment).toBeDefined();
		expect(typeof json.environment).toBe("string");
	});
});
