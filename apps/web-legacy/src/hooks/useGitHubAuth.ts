import type React from "react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import {
	handleCallback,
	startWebFlow,
	validateToken,
} from "@/utils/github-web-flow";

const STORAGE_KEY = "shipyard-github-identity";
const RETURN_URL_KEY = "github-oauth-return-url";

/** Zod schema for validating stored GitHubIdentity */
const GitHubIdentitySchema = z.object({
	token: z.string(),
	username: z.string(),
	displayName: z.string(),
	avatarUrl: z.string().optional(),
	createdAt: z.number(),
	scope: z.string(),
});

export interface GitHubIdentity {
	token: string;
	username: string;
	displayName: string;
	avatarUrl?: string;
	createdAt: number;
	/** OAuth scopes granted (space-separated). Empty string means basic identity only. */
	scope: string;
}

export type AuthState =
	| { status: "idle" }
	| { status: "exchanging_token" }
	| { status: "success" }
	| { status: "error"; message: string };

export interface UseGitHubAuthReturn {
	identity: GitHubIdentity | null;
	isValidating: boolean;
	authState: AuthState;
	/** Whether the current token has `repo` scope for private repo access */
	hasRepoScope: boolean;
	/** Start basic auth flow (identity only, no repo access) */
	startAuth: (forceAccountPicker?: boolean) => void;
	/** Request upgrade to repo scope (for private repo artifacts) */
	requestRepoAccess: () => void;
	clearAuth: () => void;
}

let changeCounter = 0;
const listeners = new Set<() => void>();

interface SnapshotCache {
	counter: number;
	value: GitHubIdentity | null;
}

/**
 * Eagerly initialized to prevent race conditions where React calls
 * getSnapshot() before the cache is populated during concurrent rendering.
 */
let snapshotCache: SnapshotCache | null = null;

function initializeSnapshotCache(): void {
	if (typeof localStorage !== "undefined" && snapshotCache === null) {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed: unknown = JSON.parse(stored);
				const validated = GitHubIdentitySchema.safeParse(parsed);
				snapshotCache = {
					counter: changeCounter,
					value: validated.success ? validated.data : null,
				};
			} else {
				snapshotCache = { counter: changeCounter, value: null };
			}
		} catch {
			snapshotCache = { counter: changeCounter, value: null };
		}
	}
}

initializeSnapshotCache();

function notifyListeners() {
	changeCounter++;
	snapshotCache = null;
	for (const listener of listeners) {
		listener();
	}
}

function subscribeLocal(callback: () => void): () => void {
	listeners.add(callback);
	return () => listeners.delete(callback);
}

function subscribeStorage(callback: () => void): () => void {
	const handleStorage = (event: StorageEvent) => {
		if (event.key === STORAGE_KEY) {
			callback();
		}
	};
	window.addEventListener("storage", handleStorage);
	return () => window.removeEventListener("storage", handleStorage);
}

function getStoredIdentity(): GitHubIdentity | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;
		const parsed: unknown = JSON.parse(stored);
		const validated = GitHubIdentitySchema.safeParse(parsed);
		if (!validated.success) {
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}
		return validated.data;
	} catch {
		localStorage.removeItem(STORAGE_KEY);
		return null;
	}
}

function setStoredIdentity(identity: GitHubIdentity): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
	notifyListeners();
}

function clearStoredIdentity(): void {
	localStorage.removeItem(STORAGE_KEY);
	notifyListeners();
}

function getSnapshot(): GitHubIdentity | null {
	if (snapshotCache !== null && snapshotCache.counter === changeCounter) {
		return snapshotCache.value;
	}
	const value = getStoredIdentity();
	snapshotCache = { counter: changeCounter, value };
	return value;
}

/**
 * React concurrent mode may call this during hydration. Reading localStorage
 * here prevents identity flickering on first render.
 */
function getServerSnapshot(): GitHubIdentity | null {
	if (typeof localStorage === "undefined") {
		return null;
	}
	return getStoredIdentity();
}

async function processOAuthCallback(
	code: string,
	state: string,
	setAuthState: React.Dispatch<React.SetStateAction<AuthState>>,
): Promise<void> {
	setAuthState({ status: "exchanging_token" });

	try {
		const redirectUri =
			window.location.origin + (import.meta.env.BASE_URL || "/");
		// New signaling server returns Shipyard JWT and user info directly
		const { token, user } = await handleCallback(code, state, redirectUri);

		// Note: The signaling server issues a Shipyard JWT, not a GitHub access token.
		// User info comes from the response, not a separate API call.
		const newIdentity: GitHubIdentity = {
			token,
			username: user.username,
			displayName: user.username, // TODO: Consider adding name to signaling response
			avatarUrl: undefined, // TODO: Consider adding avatar_url to signaling response
			createdAt: Date.now(),
			// Note: Shipyard JWTs don't have GitHub scopes. This is now a Shipyard token.
			scope: "",
		};

		setStoredIdentity(newIdentity);
		setAuthState({ status: "success" });

		const returnUrl = sessionStorage.getItem(RETURN_URL_KEY);
		sessionStorage.removeItem(RETURN_URL_KEY);

		setTimeout(() => {
			setAuthState({ status: "idle" });
			if (returnUrl && returnUrl !== window.location.pathname) {
				window.location.href = returnUrl;
			}
		}, 1500);
	} catch (err) {
		sessionStorage.removeItem(RETURN_URL_KEY);
		setAuthState({
			status: "error",
			message: err instanceof Error ? err.message : "Authentication failed",
		});
	}
}

export function useGitHubAuth(): UseGitHubAuthReturn {
	const subscribeAll = useCallback((callback: () => void) => {
		const unsubStorage = subscribeStorage(callback);
		const unsubLocal = subscribeLocal(callback);
		return () => {
			unsubStorage();
			unsubLocal();
		};
	}, []);

	const identity = useSyncExternalStore(
		subscribeAll,
		getSnapshot,
		getServerSnapshot,
	);
	const [isValidating, setIsValidating] = useState(false);
	const [authState, setAuthState] = useState<AuthState>({ status: "idle" });

	const hasRepoScope = identity?.scope?.includes("repo") ?? false;

	/**
	 * Validates token on mount. Only clears auth on confirmed 401 (invalid token).
	 * Network errors or rate limits preserve the session to avoid unnecessary logouts.
	 */
	useEffect(() => {
		if (!identity) return;

		let cancelled = false;
		const token = identity.token;

		async function validate() {
			setIsValidating(true);
			const result = await validateToken(token);
			if (cancelled) return;

			if (result.status === "invalid") {
				clearStoredIdentity();
			}
			setIsValidating(false);
		}

		validate();

		return () => {
			cancelled = true;
		};
	}, [identity]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const code = params.get("code");
		const state = params.get("state");
		const error = params.get("error");
		const errorDescription = params.get("error_description");

		if (code || error) {
			const cleanUrl = window.location.pathname + window.location.hash;
			window.history.replaceState({}, "", cleanUrl);
		}

		if (error) {
			sessionStorage.removeItem(RETURN_URL_KEY);
			setAuthState({
				status: "error",
				message: errorDescription || "Authentication was denied",
			});
			return;
		}

		if (code && state) {
			processOAuthCallback(code, state, setAuthState);
		}
	}, []);

	const startAuth = useCallback(
		(forceAccountPicker = false) => {
			if (authState.status === "exchanging_token") {
				return;
			}

			const returnUrl =
				window.location.pathname +
				window.location.search +
				window.location.hash;
			sessionStorage.setItem(RETURN_URL_KEY, returnUrl);

			const redirectUri =
				window.location.origin + (import.meta.env.BASE_URL || "/");
			startWebFlow(redirectUri, { forceAccountPicker });
		},
		[authState.status],
	);

	const requestRepoAccess = useCallback(() => {
		const returnUrl =
			window.location.pathname + window.location.search + window.location.hash;
		sessionStorage.setItem(RETURN_URL_KEY, returnUrl);

		const redirectUri =
			window.location.origin + (import.meta.env.BASE_URL || "/");
		startWebFlow(redirectUri, { scope: "repo", forceConsent: true });
	}, []);

	const clearAuth = useCallback(() => {
		clearStoredIdentity();
		setAuthState({ status: "idle" });
	}, []);

	return {
		identity,
		isValidating,
		authState,
		hasRepoScope,
		startAuth,
		requestRepoAccess,
		clearAuth,
	};
}
