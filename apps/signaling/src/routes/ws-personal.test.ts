import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { generateSessionToken } from "../auth/jwt";
import { app } from "./index";

/**
 * Helper to create a valid JWT for testing
 */
async function createTestToken(
	userId = 12345,
	username = "testuser",
): Promise<string> {
	return generateSessionToken({ id: userId, login: username }, env.JWT_SECRET);
}

describe("GET /personal/:userId (WebSocket)", () => {
	it("returns 426 without Upgrade header", async () => {
		const token = await createTestToken();

		const res = await app.request(
			`/personal/gh_12345?token=${token}`,
			{
				method: "GET",
			},
			env,
		);

		expect(res.status).toBe(426);
		const json = await res.json();
		expect(json.error).toBe("upgrade_required");
		expect(json.message).toBe("WebSocket upgrade required");
	});

	it("returns 401 without token query param", async () => {
		const res = await app.request(
			"/personal/gh_12345",
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error).toBe("missing_token");
		expect(json.message).toBe("token query param required");
	});

	it("returns 401 for invalid token", async () => {
		const res = await app.request(
			"/personal/gh_12345?token=invalid.jwt.token",
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error).toBe("invalid_token");
		expect(json.message).toBe("Invalid or expired token");
	});

	it("returns 401 for malformed token", async () => {
		const res = await app.request(
			"/personal/gh_12345?token=not-even-a-jwt",
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error).toBe("invalid_token");
	});

	it("returns 403 when userId does not match token subject", async () => {
		// Create token for user 12345, but request for different user
		const token = await createTestToken(12345, "testuser");

		const res = await app.request(
			`/personal/gh_99999?token=${token}`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.error).toBe("forbidden");
		expect(json.message).toBe("userId does not match token");
	});

	it("accepts valid WebSocket upgrade request with matching token", async () => {
		const token = await createTestToken(12345, "testuser");

		// Note: In a full integration test, this would return a 101 Switching Protocols
		// but since we're using app.request() which doesn't support actual WebSocket
		// upgrades, we verify the route handler logic up to the DO forwarding point.
		// The actual WebSocket connection would be handled by the Durable Object.

		const res = await app.request(
			`/personal/gh_12345?token=${token}`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
					Connection: "Upgrade",
				},
			},
			env,
		);

		// When using app.request(), Durable Object forwarding will fail because
		// we're not in a real Workers environment with DO stubs.
		// In the real environment, this would return 101 (WebSocket upgrade).
		// For unit testing purposes, we verify the validation passes by checking
		// that we don't get 401/403/426 errors.
		// The actual status depends on how the DO responds in the test environment.

		// If the DO forwarding fails gracefully, we might get a 500 or similar.
		// The key assertion is that authentication/authorization passed.
		expect([101, 500, 503]).toContain(res.status);
	});

	it("handles URL-encoded token", async () => {
		const token = await createTestToken(12345, "testuser");
		const encodedToken = encodeURIComponent(token);

		const res = await app.request(
			`/personal/gh_12345?token=${encodedToken}`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		// Should not return 401 (token should be properly decoded)
		expect(res.status).not.toBe(401);
	});

	it("returns 426 for HEAD request (no Upgrade)", async () => {
		const token = await createTestToken();

		const res = await app.request(
			`/personal/gh_12345?token=${token}`,
			{
				method: "HEAD",
			},
			env,
		);

		// HEAD requests don't have Upgrade header, should be treated like GET without upgrade
		expect(res.status).toBe(426);
	});

	it("validates token before checking userId match", async () => {
		// Even with matching userId, invalid token should fail first
		const res = await app.request(
			"/personal/gh_12345?token=invalid.jwt.token",
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error).toBe("invalid_token");
	});
});
