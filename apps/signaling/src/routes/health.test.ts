import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { app } from "./index";

describe("GET /health", () => {
	it("returns 200 with correct JSON structure", async () => {
		const res = await app.request("/health", {}, env as unknown as Env);

		expect(res.status).toBe(200);

		const json = (await res.json()) as Record<string, unknown>;
		expect(json).toEqual({
			status: "ok",
			service: "shipyard-signaling",
			environment: (env as unknown as Env).ENVIRONMENT,
		});
	});

	it("includes environment in response", async () => {
		const res = await app.request("/health", {}, env as unknown as Env);
		const json = (await res.json()) as Record<string, unknown>;

		expect(json.environment).toBeDefined();
		expect(typeof json.environment).toBe("string");
	});
});
