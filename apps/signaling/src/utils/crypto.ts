/**
 * Cryptographic utilities using Web Crypto API.
 */

/**
 * SHA-256 hash a value, returns hex string.
 */
export async function hashValue(value: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(value);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Timing-safe string comparison.
 * Prevents timing attacks by always comparing all bytes.
 */
export function timingSafeCompare(a: string, b: string): boolean {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);
	const maxLen = Math.max(aBytes.length, bBytes.length);

	let result = aBytes.length === bBytes.length ? 0 : 1;

	for (let i = 0; i < maxLen; i++) {
		const aByte = i < aBytes.length ? (aBytes[i] ?? 0) : 0;
		const bByte = i < bBytes.length ? (bBytes[i] ?? 0) : 0;
		result |= aByte ^ bByte;
	}

	return result === 0;
}

/**
 * Generate random ID (nanoid-style).
 * Default length: 21 characters.
 */
export function generateId(length = 21): string {
	const alphabet =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const randomBytes = new Uint8Array(length);
	crypto.getRandomValues(randomBytes);

	let id = "";
	for (let i = 0; i < length; i++) {
		const byte = randomBytes[i];
		if (byte !== undefined) {
			id += alphabet[byte % alphabet.length];
		}
	}
	return id;
}

/**
 * Generate random token (32 bytes, base64url encoded).
 */
export function generateToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

/**
 * HMAC-SHA256 signature using Web Crypto API.
 */
export async function hmacSign(data: string, secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const keyData = encoder.encode(secret);
	const message = encoder.encode(data);

	const key = await crypto.subtle.importKey(
		"raw",
		keyData,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign("HMAC", key, message);
	return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Verify HMAC-SHA256 signature.
 */
export async function hmacVerify(
	data: string,
	signature: string,
	secret: string,
): Promise<boolean> {
	const expectedSignature = await hmacSign(data, secret);
	return timingSafeCompare(signature, expectedSignature);
}

// ============ Internal helpers ============

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	const base64 = btoa(binary);
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
