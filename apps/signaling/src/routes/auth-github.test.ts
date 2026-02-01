import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "./index";

// GitHub API endpoints
const GITHUB_TOKEN_URL = "https://github.com";
const GITHUB_API_URL = "https://api.github.com";

describe("POST /auth/github/callback", () => {
	beforeAll(() => {
		fetchMock.activate();
		fetchMock.disableNetConnect();
	});

	afterEach(() => {
		fetchMock.assertNoPendingInterceptors();
	});

	it("returns 400 for invalid JSON body", async () => {
		const res = await app.request(
			"/auth/github/callback",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not valid json",
			},
			env,
		);

		expect(res.status).toBe(400);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("invalid_body");
	});

	it("returns 400 for missing code", async () => {
		const res = await app.request(
			"/auth/github/callback",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ redirect_uri: "http://localhost:3000" }),
			},
			env,
		);

		expect(res.status).toBe(400);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("missing_code");
		expect(json.message).toBe("code is required");
	});

	it("returns 400 for missing redirect_uri", async () => {
		const res = await app.request(
			"/auth/github/callback",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: "test-code" }),
			},
			env,
		);

		expect(res.status).toBe(400);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("missing_redirect_uri");
		expect(json.message).toBe("redirect_uri is required");
	});

	it("returns 401 for invalid code (GitHub API error)", async () => {
		// Mock GitHub token exchange failure
		fetchMock
			.get(GITHUB_TOKEN_URL)
			.intercept({ path: "/login/oauth/access_token", method: "POST" })
			.reply(
				200,
				JSON.stringify({
					error: "bad_verification_code",
					error_description: "The code passed is incorrect or expired.",
				}),
				{ headers: { "Content-Type": "application/json" } },
			);

		const res = await app.request(
			"/auth/github/callback",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code: "invalid-code",
					redirect_uri: "http://localhost:3000",
				}),
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("token_exchange_failed");
	});

	it("returns 401 when GitHub user fetch fails", async () => {
		// Mock successful token exchange
		fetchMock
			.get(GITHUB_TOKEN_URL)
			.intercept({ path: "/login/oauth/access_token", method: "POST" })
			.reply(200, JSON.stringify({ access_token: "gho_test_token" }), {
				headers: { "Content-Type": "application/json" },
			});

		// Mock failed user fetch
		fetchMock
			.get(GITHUB_API_URL)
			.intercept({ path: "/user", method: "GET" })
			.reply(401, "Unauthorized");

		const res = await app.request(
			"/auth/github/callback",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code: "valid-code",
					redirect_uri: "http://localhost:3000",
				}),
			},
			env,
		);

		expect(res.status).toBe(401);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBe("user_fetch_failed");
	});

	it("returns Shipyard JWT for valid code", async () => {
		// Mock successful token exchange
		fetchMock
			.get(GITHUB_TOKEN_URL)
			.intercept({ path: "/login/oauth/access_token", method: "POST" })
			.reply(200, JSON.stringify({ access_token: "gho_test_token" }), {
				headers: { "Content-Type": "application/json" },
			});

		// Mock successful user fetch
		fetchMock
			.get(GITHUB_API_URL)
			.intercept({ path: "/user", method: "GET" })
			.reply(
				200,
				JSON.stringify({
					id: 12345,
					login: "testuser",
					name: "Test User",
					avatar_url: "https://avatars.githubusercontent.com/u/12345",
				}),
				{ headers: { "Content-Type": "application/json" } },
			);

		const res = await app.request(
			"/auth/github/callback",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code: "valid-code",
					redirect_uri: "http://localhost:3000",
				}),
			},
			env,
		);

		expect(res.status).toBe(200);
		const json = (await res.json()) as Record<string, unknown>;

		// Verify response structure
		expect(json.token).toBeDefined();
		expect(typeof json.token).toBe("string");
		expect((json.token as string).split(".")).toHaveLength(3); // JWT has 3 parts

		expect(json.user).toEqual({
			id: "gh_12345",
			username: "testuser",
		});

		// Should not have is_mobile for desktop user agent
		expect(json.is_mobile).toBeUndefined();
	});

	it("includes is_mobile for mobile user agents", async () => {
		// Mock successful token exchange
		fetchMock
			.get(GITHUB_TOKEN_URL)
			.intercept({ path: "/login/oauth/access_token", method: "POST" })
			.reply(200, JSON.stringify({ access_token: "gho_test_token" }), {
				headers: { "Content-Type": "application/json" },
			});

		// Mock successful user fetch
		fetchMock
			.get(GITHUB_API_URL)
			.intercept({ path: "/user", method: "GET" })
			.reply(
				200,
				JSON.stringify({
					id: 12345,
					login: "testuser",
					name: "Test User",
					avatar_url: "https://avatars.githubusercontent.com/u/12345",
				}),
				{ headers: { "Content-Type": "application/json" } },
			);

		const res = await app.request(
			"/auth/github/callback",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"User-Agent":
						"Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
				},
				body: JSON.stringify({
					code: "valid-code",
					redirect_uri: "http://localhost:3000",
				}),
			},
			env,
		);

		expect(res.status).toBe(200);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.is_mobile).toBe(true);
	});

	it("detects Android as mobile", async () => {
		// Mock successful token exchange
		fetchMock
			.get(GITHUB_TOKEN_URL)
			.intercept({ path: "/login/oauth/access_token", method: "POST" })
			.reply(200, JSON.stringify({ access_token: "gho_test_token" }), {
				headers: { "Content-Type": "application/json" },
			});

		// Mock successful user fetch
		fetchMock
			.get(GITHUB_API_URL)
			.intercept({ path: "/user", method: "GET" })
			.reply(
				200,
				JSON.stringify({
					id: 12345,
					login: "testuser",
					name: "Test User",
				}),
				{ headers: { "Content-Type": "application/json" } },
			);

		const res = await app.request(
			"/auth/github/callback",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"User-Agent":
						"Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36",
				},
				body: JSON.stringify({
					code: "valid-code",
					redirect_uri: "http://localhost:3000",
				}),
			},
			env,
		);

		expect(res.status).toBe(200);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.is_mobile).toBe(true);
	});
});
