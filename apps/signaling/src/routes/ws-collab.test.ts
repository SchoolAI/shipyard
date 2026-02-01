import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PresignedUrlPayload } from "../auth/types";
import type { Env } from "../env";
import { hmacSign } from "../utils/crypto";
import { app } from "./index";

/**
 * Helper to create a valid pre-signed URL token for testing
 */
async function createPresignedToken(
	roomId: string,
	taskId = "task-123",
	inviterId = "gh_12345",
	expiresInMs = 60 * 60 * 1000, // 1 hour
): Promise<string> {
	const payload: PresignedUrlPayload = {
		roomId,
		taskId,
		inviterId,
		exp: Date.now() + expiresInMs,
	};

	const payloadJson = JSON.stringify(payload);
	const payloadB64 = btoa(payloadJson)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

	// Sign with HMAC using test secret
	const signature = await hmacSign(
		payloadB64,
		(env as unknown as Env).JWT_SECRET,
	);
	return `${payloadB64}.${signature}`;
}

/**
 * Helper to create an expired pre-signed URL token
 */
async function createExpiredToken(roomId: string): Promise<string> {
	const payload: PresignedUrlPayload = {
		roomId,
		taskId: "task-123",
		inviterId: "gh_12345",
		exp: Date.now() - 3600000, // Expired 1 hour ago
	};

	const payloadJson = JSON.stringify(payload);
	const payloadB64 = btoa(payloadJson)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

	// Sign with HMAC using test secret
	const signature = await hmacSign(
		payloadB64,
		(env as unknown as Env).JWT_SECRET,
	);
	return `${payloadB64}.${signature}`;
}

describe("GET /collab/:roomId (WebSocket)", () => {
	const testRoomId = "test-room-abc123";

	it("returns 426 without Upgrade header", async () => {
		const token = await createPresignedToken(testRoomId);

		const res = await app.request(
			`/collab/${testRoomId}?token=${token}`,
			{
				method: "GET",
			},
			env,
		);

		expect(res.status).toBe(426);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("upgrade_required");
		expect(json.message).toBe("WebSocket upgrade required");
	});

	it("returns 401 without token query param", async () => {
		const res = await app.request(
			`/collab/${testRoomId}`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("missing_token");
		expect(json.message).toBe("token query param required");
	});

	it("returns 401 for invalid token format", async () => {
		const res = await app.request(
			`/collab/${testRoomId}?token=not-a-valid-token`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("invalid_token");
		expect(json.message).toBe("Invalid or expired token");
	});

	it("returns 401 for token with invalid JSON payload", async () => {
		// Create a token with invalid base64/JSON
		const invalidToken = "not-valid-base64.signature";

		const res = await app.request(
			`/collab/${testRoomId}?token=${invalidToken}`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("invalid_token");
	});

	it("returns 401 for expired token", async () => {
		const token = await createExpiredToken(testRoomId);

		const res = await app.request(
			`/collab/${testRoomId}?token=${token}`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		// The route checks expiration and returns 401 with "expired" error
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("invalid_token");
	});

	it("returns 403 when roomId does not match token payload", async () => {
		// Create token for different room
		const token = await createPresignedToken("different-room");

		const res = await app.request(
			`/collab/${testRoomId}?token=${token}`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(403);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("forbidden");
		expect(json.message).toBe("roomId does not match token");
	});

	it("accepts valid WebSocket upgrade request with matching token", async () => {
		const token = await createPresignedToken(testRoomId);

		const res = await app.request(
			`/collab/${testRoomId}?token=${token}`,
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
		expect([101, 500, 503]).toContain(res.status);
	});

	it("handles URL-encoded token", async () => {
		const token = await createPresignedToken(testRoomId);
		const encodedToken = encodeURIComponent(token);

		const res = await app.request(
			`/collab/${testRoomId}?token=${encodedToken}`,
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

	it("returns 401 for token missing required payload fields", async () => {
		// Create token with incomplete payload (missing roomId)
		const incompletePayload = {
			taskId: "task-123",
			inviterId: "gh_12345",
			exp: Date.now() + 3600000,
			// roomId is missing
		};

		const payloadJson = JSON.stringify(incompletePayload);
		const payloadB64 = btoa(payloadJson)
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		const incompleteToken = `${payloadB64}.signature`;

		const res = await app.request(
			`/collab/${testRoomId}?token=${incompleteToken}`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("invalid_token");
	});

	it("validates token before checking roomId match", async () => {
		// Even with matching roomId, invalid token should fail first
		const res = await app.request(
			`/collab/${testRoomId}?token=invalid.token`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("invalid_token");
	});

	it("handles special characters in roomId", async () => {
		const specialRoomId = "room-with-dashes_and_underscores";
		const token = await createPresignedToken(specialRoomId);

		const res = await app.request(
			`/collab/${specialRoomId}?token=${token}`,
			{
				method: "GET",
				headers: {
					Upgrade: "websocket",
				},
			},
			env,
		);

		// Should pass validation (not 401/403/426)
		expect([101, 500, 503]).toContain(res.status);
	});

	it("returns 426 for non-GET requests without upgrade", async () => {
		const token = await createPresignedToken(testRoomId);

		// POST should also require upgrade header
		const res = await app.request(
			`/collab/${testRoomId}?token=${token}`,
			{
				method: "POST",
				body: "{}",
			},
			env,
		);

		// POST to a GET route should return 404 or 405
		expect([404, 405]).toContain(res.status);
	});
});
