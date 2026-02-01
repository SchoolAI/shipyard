/**
 * Type-safe client for the Shipyard signaling server.
 *
 * Provides methods for all HTTP endpoints with full request/response validation.
 *
 * @example
 * ```ts
 * const client = new SignalingClient('https://signaling.shipyard.dev');
 *
 * // Exchange OAuth code for JWT
 * const auth = await client.authGitHubCallback({
 *   code: 'github_oauth_code',
 *   redirect_uri: 'https://app.shipyard.dev/auth/callback',
 * });
 *
 * // Create a collaboration room (requires auth)
 * const collab = await client.createCollab({
 *   taskId: 'task_123',
 *   expiresInMinutes: 120,
 * });
 * ```
 *
 * @module client
 */

import {
	type AuthGitHubCallbackRequest,
	AuthGitHubCallbackRequestSchema,
	type AuthGitHubCallbackResponse,
	AuthGitHubCallbackResponseSchema,
	type CollabCreateRequest,
	CollabCreateRequestSchema,
	type CollabCreateResponse,
	CollabCreateResponseSchema,
	ErrorResponseSchema,
	type HealthResponse,
	HealthResponseSchema,
	type ValidationErrorResponse,
	ValidationErrorResponseSchema,
} from "../schemas";
import { ROUTES } from "./routes";

// Re-export routes for client consumers
export { ROUTE_DESCRIPTIONS, ROUTES } from "./routes";

/**
 * Error thrown when the signaling server returns an error response.
 */
export class SignalingClientError extends Error {
	constructor(
		/** The error code from the server */
		public readonly code: string,
		message: string,
		/** HTTP status code */
		public readonly status: number,
		/** Validation error details, if present */
		public readonly details?: ValidationErrorResponse["details"],
	) {
		super(message);
		this.name = "SignalingClientError";
	}
}

/**
 * Error thrown when the server response doesn't match the expected schema.
 */
export class SignalingClientValidationError extends Error {
	constructor(
		message: string,
		/** The raw response that failed validation */
		public readonly response: unknown,
	) {
		super(message);
		this.name = "SignalingClientValidationError";
	}
}

/**
 * Configuration options for the SignalingClient.
 */
export interface SignalingClientOptions {
	/**
	 * Optional fetch implementation (useful for testing or custom environments).
	 * Defaults to global fetch.
	 */
	fetch?: typeof fetch;

	/**
	 * Optional default headers to include with every request.
	 */
	defaultHeaders?: Record<string, string>;
}

/**
 * Type-safe client for the Shipyard signaling server.
 *
 * All methods validate both request and response bodies using Zod schemas.
 */
export class SignalingClient {
	private readonly fetch: typeof fetch;
	private readonly defaultHeaders: Record<string, string>;

	/**
	 * Creates a new SignalingClient instance.
	 *
	 * @param baseUrl - Base URL of the signaling server (e.g., 'https://signaling.shipyard.dev')
	 * @param options - Optional configuration
	 */
	constructor(
		private readonly baseUrl: string,
		options: SignalingClientOptions = {},
	) {
		this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.defaultHeaders = options.defaultHeaders ?? {};
	}

	/**
	 * Check server health.
	 *
	 * GET /health
	 *
	 * @returns Health status with service name and environment
	 * @throws {SignalingClientError} If the server returns an error
	 * @throws {SignalingClientValidationError} If the response doesn't match expected schema
	 */
	async health(): Promise<HealthResponse> {
		const response = await this.fetch(`${this.baseUrl}${ROUTES.HEALTH}`, {
			method: "GET",
			headers: this.defaultHeaders,
		});

		const data = await response.json();

		if (!response.ok) {
			this.throwError(response.status, data);
		}

		const result = HealthResponseSchema.safeParse(data);
		if (!result.success) {
			throw new SignalingClientValidationError(
				`Invalid health response: ${result.error.message}`,
				data,
			);
		}

		return result.data;
	}

	/**
	 * Exchange a GitHub OAuth code for a Shipyard JWT.
	 *
	 * POST /auth/github/callback
	 *
	 * @param request - OAuth code and redirect URI
	 * @returns JWT token and user info
	 * @throws {SignalingClientError} If authentication fails
	 * @throws {SignalingClientValidationError} If request/response doesn't match expected schema
	 */
	async authGitHubCallback(
		request: AuthGitHubCallbackRequest,
	): Promise<AuthGitHubCallbackResponse> {
		const requestResult = AuthGitHubCallbackRequestSchema.safeParse(request);
		if (!requestResult.success) {
			throw new SignalingClientValidationError(
				`Invalid request: ${requestResult.error.message}`,
				request,
			);
		}

		const response = await this.fetch(
			`${this.baseUrl}${ROUTES.AUTH_GITHUB_CALLBACK}`,
			{
				method: "POST",
				headers: {
					...this.defaultHeaders,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestResult.data),
			},
		);

		const data = await response.json();

		if (!response.ok) {
			this.throwError(response.status, data);
		}

		const result = AuthGitHubCallbackResponseSchema.safeParse(data);
		if (!result.success) {
			throw new SignalingClientValidationError(
				`Invalid auth response: ${result.error.message}`,
				data,
			);
		}

		return result.data;
	}

	/**
	 * Create a new collaboration room.
	 *
	 * POST /collab/create
	 *
	 * Requires authentication - use `withAuth()` to create an authenticated client.
	 *
	 * @param request - Task ID and optional expiration
	 * @param token - Shipyard JWT for authentication
	 * @returns Pre-signed WebSocket URL and room info
	 * @throws {SignalingClientError} If authorization fails or request is invalid
	 * @throws {SignalingClientValidationError} If request/response doesn't match expected schema
	 */
	async createCollab(
		request: CollabCreateRequest,
		token: string,
	): Promise<CollabCreateResponse> {
		const requestResult = CollabCreateRequestSchema.safeParse(request);
		if (!requestResult.success) {
			throw new SignalingClientValidationError(
				`Invalid request: ${requestResult.error.message}`,
				request,
			);
		}

		const response = await this.fetch(`${this.baseUrl}${ROUTES.COLLAB_CREATE}`, {
			method: "POST",
			headers: {
				...this.defaultHeaders,
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(requestResult.data),
		});

		const data = await response.json();

		if (!response.ok) {
			this.throwError(response.status, data);
		}

		const result = CollabCreateResponseSchema.safeParse(data);
		if (!result.success) {
			throw new SignalingClientValidationError(
				`Invalid collab create response: ${result.error.message}`,
				data,
			);
		}

		return result.data;
	}

	/**
	 * Build a WebSocket URL for connecting to a personal room.
	 *
	 * Note: This method only builds the URL. Use a WebSocket library to connect.
	 *
	 * @param userId - The user ID to connect as
	 * @param token - Shipyard JWT for authentication
	 * @returns WebSocket URL for connecting to the personal room
	 */
	buildPersonalRoomUrl(userId: string, token: string): string {
		const wsBaseUrl = this.baseUrl
			.replace(/^http:/, "ws:")
			.replace(/^https:/, "wss:");
		return `${wsBaseUrl}/personal/${encodeURIComponent(userId)}?token=${encodeURIComponent(token)}`;
	}

	/**
	 * Build a WebSocket URL for connecting to a collaboration room.
	 *
	 * Note: This method only builds the URL. Use a WebSocket library to connect.
	 * The token should be extracted from the pre-signed URL returned by createCollab().
	 *
	 * @param roomId - The room ID to connect to
	 * @param presignedToken - The pre-signed URL token from createCollab()
	 * @param userToken - Optional user JWT for authenticated users
	 * @returns WebSocket URL for connecting to the collab room
	 */
	buildCollabRoomUrl(
		roomId: string,
		presignedToken: string,
		userToken?: string,
	): string {
		const wsBaseUrl = this.baseUrl
			.replace(/^http:/, "ws:")
			.replace(/^https:/, "wss:");
		let url = `${wsBaseUrl}/collab/${encodeURIComponent(roomId)}?token=${encodeURIComponent(presignedToken)}`;
		if (userToken) {
			url += `&userToken=${encodeURIComponent(userToken)}`;
		}
		return url;
	}

	/**
	 * Extract the pre-signed token from a collab URL.
	 *
	 * @param presignedUrl - The full pre-signed URL from createCollab()
	 * @returns The token query parameter value, or null if not found
	 */
	extractTokenFromPresignedUrl(presignedUrl: string): string | null {
		try {
			const url = new URL(presignedUrl);
			return url.searchParams.get("token");
		} catch {
			return null;
		}
	}

	/**
	 * Create an authenticated client that automatically includes the token.
	 *
	 * @param token - Shipyard JWT to include in all requests
	 * @returns A new SignalingClient configured with the auth token
	 */
	withAuth(token: string): AuthenticatedSignalingClient {
		return new AuthenticatedSignalingClient(this.baseUrl, token, {
			fetch: this.fetch,
			defaultHeaders: this.defaultHeaders,
		});
	}

	/**
	 * Parse error response and throw appropriate error.
	 */
	private throwError(status: number, data: unknown): never {
		const validationResult = ValidationErrorResponseSchema.safeParse(data);
		if (validationResult.success) {
			throw new SignalingClientError(
				validationResult.data.error,
				validationResult.data.message,
				status,
				validationResult.data.details,
			);
		}

		const errorResult = ErrorResponseSchema.safeParse(data);
		if (errorResult.success) {
			throw new SignalingClientError(
				errorResult.data.error,
				errorResult.data.message,
				status,
			);
		}

		throw new SignalingClientError(
			"unknown_error",
			`Server returned status ${status}`,
			status,
		);
	}
}

/**
 * Authenticated SignalingClient that automatically includes the JWT token.
 *
 * Created via SignalingClient.withAuth(token).
 */
export class AuthenticatedSignalingClient extends SignalingClient {
	constructor(
		baseUrl: string,
		private readonly token: string,
		options: SignalingClientOptions = {},
	) {
		super(baseUrl, options);
	}

	/**
	 * Create a new collaboration room.
	 *
	 * POST /collab/create
	 *
	 * Token is automatically included from the authenticated client.
	 *
	 * @param request - Task ID and optional expiration
	 * @returns Pre-signed WebSocket URL and room info
	 */
	override async createCollab(
		request: CollabCreateRequest,
	): Promise<CollabCreateResponse>;
	override async createCollab(
		request: CollabCreateRequest,
		_token?: string,
	): Promise<CollabCreateResponse> {
		return super.createCollab(request, this.token);
	}

	/**
	 * Build a WebSocket URL for connecting to a personal room.
	 *
	 * Uses the authenticated user's ID (derived from the token).
	 * Note: You'll need to decode the JWT to get the user ID, or provide it explicitly.
	 *
	 * @param userId - The user ID to connect as
	 * @returns WebSocket URL for connecting to the personal room
	 */
	override buildPersonalRoomUrl(userId: string): string;
	override buildPersonalRoomUrl(userId: string, _token?: string): string {
		return super.buildPersonalRoomUrl(userId, this.token);
	}

	/**
	 * Build a WebSocket URL for connecting to a collaboration room with user authentication.
	 *
	 * @param roomId - The room ID to connect to
	 * @param presignedToken - The pre-signed URL token from createCollab()
	 * @returns WebSocket URL for connecting to the collab room
	 */
	override buildCollabRoomUrl(roomId: string, presignedToken: string): string {
		return super.buildCollabRoomUrl(roomId, presignedToken, this.token);
	}

	/**
	 * Get the authentication token.
	 *
	 * @returns The JWT token used for authentication
	 */
	getToken(): string {
		return this.token;
	}
}

/**
 * Create a new SignalingClient instance.
 *
 * Convenience function for creating a client.
 *
 * @param baseUrl - Base URL of the signaling server
 * @param options - Optional configuration
 * @returns A new SignalingClient instance
 */
export function createSignalingClient(
	baseUrl: string,
	options?: SignalingClientOptions,
): SignalingClient {
	return new SignalingClient(baseUrl, options);
}
