import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	ErrorCodes,
	errorResponse,
	expiredResponse,
	extractBearerToken,
	forbiddenResponse,
	invalidTokenResponse,
	parseAndValidateBody,
	parseJsonBody,
	requireQueryParam,
	requireWebSocketUpgrade,
	validationErrorResponse,
} from "./route-helpers";

/**
 * Type for JSON responses in tests.
 */
type JsonResponse = Record<string, unknown>;

// Helper to create a minimal Hono app for testing
function createTestApp() {
	return new Hono();
}

// Helper to make a request and get the response
async function makeRequest(
	app: ReturnType<typeof createTestApp>,
	path: string,
	options?: RequestInit,
): Promise<Response> {
	const request = new Request(`http://localhost${path}`, options);
	return app.fetch(request);
}

describe("route-helpers", () => {
	describe("errorResponse", () => {
		it("creates 400 error response with correct structure", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				return errorResponse(c, "test_error", "Test message", 400);
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(400);
			const json = (await res.json()) as JsonResponse;
			expect(json).toEqual({
				error: "test_error",
				message: "Test message",
			});
		});

		it("creates 401 error response", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				return errorResponse(c, ErrorCodes.UNAUTHORIZED, "Not authorized", 401);
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(401);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("unauthorized");
		});

		it("creates 403 error response", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				return errorResponse(c, ErrorCodes.FORBIDDEN, "Forbidden", 403);
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(403);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("forbidden");
		});

		it("creates 426 error response", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				return errorResponse(
					c,
					ErrorCodes.UPGRADE_REQUIRED,
					"Upgrade required",
					426,
				);
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(426);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("upgrade_required");
		});

		it("creates 500 error response", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				return errorResponse(c, "internal_error", "Something went wrong", 500);
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(500);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("internal_error");
		});
	});

	describe("validationErrorResponse", () => {
		it("creates validation error with Zod error details", async () => {
			const schema = z.object({
				name: z.string().min(1, "Name is required"),
				age: z.number().positive("Age must be positive"),
			});

			const app = createTestApp();
			app.get("/test", (c) => {
				const result = schema.safeParse({ name: "", age: -1 });
				if (!result.success) {
					return validationErrorResponse(c, result.error);
				}
				return c.json({ ok: true });
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(400);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("validation_error");
			expect(json.message).toBe("Name is required");
			expect(json.details).toBeDefined();
			expect(Array.isArray(json.details)).toBe(true);
			expect((json.details as unknown[]).length).toBe(2);
		});

		it("uses first issue message", async () => {
			const schema = z.object({
				email: z.string().email("Invalid email format"),
			});

			const app = createTestApp();
			app.get("/test", (c) => {
				const result = schema.safeParse({ email: "not-an-email" });
				if (!result.success) {
					return validationErrorResponse(c, result.error);
				}
				return c.json({ ok: true });
			});

			const res = await makeRequest(app, "/test");

			const json = (await res.json()) as JsonResponse;
			expect(json.message).toBe("Invalid email format");
		});

		it("provides fallback message when no issues", async () => {
			// Create a ZodError with empty issues array (edge case)
			const zodError = new z.ZodError([]);

			const app = createTestApp();
			app.get("/test", (c) => {
				return validationErrorResponse(c, zodError);
			});

			const res = await makeRequest(app, "/test");

			const json = (await res.json()) as JsonResponse;
			expect(json.message).toBe("Invalid request body");
		});
	});

	describe("parseJsonBody", () => {
		it("successfully parses valid JSON body", async () => {
			const app = createTestApp();
			app.post("/test", async (c) => {
				const result = await parseJsonBody(c);
				if (!result.ok) return result.error;
				return c.json({ received: result.value });
			});

			const res = await makeRequest(app, "/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ hello: "world" }),
			});

			expect(res.status).toBe(200);
			const json = (await res.json()) as JsonResponse;
			expect(json.received).toEqual({ hello: "world" });
		});

		it("returns error for invalid JSON", async () => {
			const app = createTestApp();
			app.post("/test", async (c) => {
				const result = await parseJsonBody(c);
				if (!result.ok) return result.error;
				return c.json({ received: result.value });
			});

			const res = await makeRequest(app, "/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not valid json",
			});

			expect(res.status).toBe(400);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("invalid_body");
			expect(json.message).toBe("Invalid JSON body");
		});

		it("returns error for empty body", async () => {
			const app = createTestApp();
			app.post("/test", async (c) => {
				const result = await parseJsonBody(c);
				if (!result.ok) return result.error;
				return c.json({ received: result.value });
			});

			const res = await makeRequest(app, "/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "",
			});

			expect(res.status).toBe(400);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("invalid_body");
		});
	});

	describe("parseAndValidateBody", () => {
		const TestSchema = z.object({
			name: z.string().min(1),
			count: z.number().int().positive(),
		});

		it("successfully parses and validates valid body", async () => {
			const app = createTestApp();
			app.post("/test", async (c) => {
				const result = await parseAndValidateBody(c, TestSchema);
				if (!result.ok) return result.error;
				return c.json({ received: result.value });
			});

			const res = await makeRequest(app, "/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test", count: 5 }),
			});

			expect(res.status).toBe(200);
			const json = (await res.json()) as JsonResponse;
			expect(json.received).toEqual({ name: "test", count: 5 });
		});

		it("returns invalid_body error for malformed JSON", async () => {
			const app = createTestApp();
			app.post("/test", async (c) => {
				const result = await parseAndValidateBody(c, TestSchema);
				if (!result.ok) return result.error;
				return c.json({ received: result.value });
			});

			const res = await makeRequest(app, "/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			});

			expect(res.status).toBe(400);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("invalid_body");
		});

		it("returns validation_error for schema mismatch", async () => {
			const app = createTestApp();
			app.post("/test", async (c) => {
				const result = await parseAndValidateBody(c, TestSchema);
				if (!result.ok) return result.error;
				return c.json({ received: result.value });
			});

			const res = await makeRequest(app, "/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "", count: -1 }),
			});

			expect(res.status).toBe(400);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("validation_error");
			expect(json.details).toBeDefined();
		});

		it("returns validation_error for missing fields", async () => {
			const app = createTestApp();
			app.post("/test", async (c) => {
				const result = await parseAndValidateBody(c, TestSchema);
				if (!result.ok) return result.error;
				return c.json({ received: result.value });
			});

			const res = await makeRequest(app, "/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test" }),
			});

			expect(res.status).toBe(400);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("validation_error");
		});

		it("returns validation_error for wrong types", async () => {
			const app = createTestApp();
			app.post("/test", async (c) => {
				const result = await parseAndValidateBody(c, TestSchema);
				if (!result.ok) return result.error;
				return c.json({ received: result.value });
			});

			const res = await makeRequest(app, "/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: 123, count: "not a number" }),
			});

			expect(res.status).toBe(400);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("validation_error");
		});
	});

	describe("extractBearerToken", () => {
		it("extracts token from valid Bearer header", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = extractBearerToken(c);
				if (!result.ok) return result.error;
				return c.json({ token: result.value });
			});

			const res = await makeRequest(app, "/test", {
				headers: { Authorization: "Bearer my-jwt-token-123" },
			});

			expect(res.status).toBe(200);
			const json = (await res.json()) as JsonResponse;
			expect(json.token).toBe("my-jwt-token-123");
		});

		it("returns error when Authorization header missing", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = extractBearerToken(c);
				if (!result.ok) return result.error;
				return c.json({ token: result.value });
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(401);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("unauthorized");
			expect(json.message).toBe("Bearer token required");
		});

		it("returns error when Authorization header does not start with Bearer", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = extractBearerToken(c);
				if (!result.ok) return result.error;
				return c.json({ token: result.value });
			});

			const res = await makeRequest(app, "/test", {
				headers: { Authorization: "Basic dXNlcjpwYXNz" },
			});

			expect(res.status).toBe(401);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("unauthorized");
		});

		it("handles empty Authorization header", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = extractBearerToken(c);
				if (!result.ok) return result.error;
				return c.json({ token: result.value });
			});

			const res = await makeRequest(app, "/test", {
				headers: { Authorization: "" },
			});

			expect(res.status).toBe(401);
		});

		it("extracts token with special characters", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = extractBearerToken(c);
				if (!result.ok) return result.error;
				return c.json({ token: result.value });
			});

			// JWT tokens have dots and base64 characters
			const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig";
			const res = await makeRequest(app, "/test", {
				headers: { Authorization: `Bearer ${token}` },
			});

			expect(res.status).toBe(200);
			const json = (await res.json()) as JsonResponse;
			expect(json.token).toBe(token);
		});
	});

	describe("requireQueryParam", () => {
		it("returns value when query param exists", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = requireQueryParam(c, "token");
				if (!result.ok) return result.error;
				return c.json({ token: result.value });
			});

			const res = await makeRequest(app, "/test?token=abc123");

			expect(res.status).toBe(200);
			const json = (await res.json()) as JsonResponse;
			expect(json.token).toBe("abc123");
		});

		it("returns error when query param missing", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = requireQueryParam(c, "token");
				if (!result.ok) return result.error;
				return c.json({ token: result.value });
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(401);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("missing_token");
			expect(json.message).toBe("token query param required");
		});

		it("uses param name in error message", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = requireQueryParam(c, "apiKey");
				if (!result.ok) return result.error;
				return c.json({ apiKey: result.value });
			});

			const res = await makeRequest(app, "/test");

			const json = (await res.json()) as JsonResponse;
			expect(json.message).toBe("apiKey query param required");
		});

		it("handles URL-encoded values", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = requireQueryParam(c, "token");
				if (!result.ok) return result.error;
				return c.json({ token: result.value });
			});

			const res = await makeRequest(
				app,
				`/test?token=${encodeURIComponent("value with spaces")}`,
			);

			expect(res.status).toBe(200);
			const json = (await res.json()) as JsonResponse;
			expect(json.token).toBe("value with spaces");
		});
	});

	describe("requireWebSocketUpgrade", () => {
		it("succeeds when Upgrade header is websocket", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = requireWebSocketUpgrade(c);
				if (!result.ok) return result.error;
				return c.json({ upgraded: true });
			});

			const res = await makeRequest(app, "/test", {
				headers: { Upgrade: "websocket" },
			});

			expect(res.status).toBe(200);
			const json = (await res.json()) as JsonResponse;
			expect(json.upgraded).toBe(true);
		});

		it("returns 426 when Upgrade header missing", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = requireWebSocketUpgrade(c);
				if (!result.ok) return result.error;
				return c.json({ upgraded: true });
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(426);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("upgrade_required");
			expect(json.message).toBe("WebSocket upgrade required");
		});

		it("returns 426 when Upgrade header is not websocket", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				const result = requireWebSocketUpgrade(c);
				if (!result.ok) return result.error;
				return c.json({ upgraded: true });
			});

			const res = await makeRequest(app, "/test", {
				headers: { Upgrade: "h2c" },
			});

			expect(res.status).toBe(426);
		});
	});

	describe("invalidTokenResponse", () => {
		it("creates correct error response", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				return invalidTokenResponse(c);
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(401);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("invalid_token");
			expect(json.message).toBe("Invalid or expired token");
		});
	});

	describe("forbiddenResponse", () => {
		it("creates forbidden error with custom message", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				return forbiddenResponse(c, "userId does not match token");
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(403);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("forbidden");
			expect(json.message).toBe("userId does not match token");
		});
	});

	describe("expiredResponse", () => {
		it("creates expired error with custom message", async () => {
			const app = createTestApp();
			app.get("/test", (c) => {
				return expiredResponse(c, "Collaboration link has expired");
			});

			const res = await makeRequest(app, "/test");

			expect(res.status).toBe(401);
			const json = (await res.json()) as JsonResponse;
			expect(json.error).toBe("expired");
			expect(json.message).toBe("Collaboration link has expired");
		});
	});

	describe("ErrorCodes", () => {
		it("exports all expected error codes", () => {
			expect(ErrorCodes.INVALID_BODY).toBe("invalid_body");
			expect(ErrorCodes.VALIDATION_ERROR).toBe("validation_error");
			expect(ErrorCodes.UNAUTHORIZED).toBe("unauthorized");
			expect(ErrorCodes.INVALID_TOKEN).toBe("invalid_token");
			expect(ErrorCodes.MISSING_TOKEN).toBe("missing_token");
			expect(ErrorCodes.FORBIDDEN).toBe("forbidden");
			expect(ErrorCodes.UPGRADE_REQUIRED).toBe("upgrade_required");
			expect(ErrorCodes.EXPIRED).toBe("expired");
		});
	});
});
