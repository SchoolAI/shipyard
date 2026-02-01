/**
 * Pre-signed URL generation and validation for collab rooms.
 */

import type { PresignedUrlPayload } from "../auth/types";
import { hmacSign, hmacVerify } from "./crypto";

/**
 * Generate a pre-signed URL for collab room access.
 *
 * URL format: {baseUrl}/collab/{roomId}?token={signed_token}
 */
export async function generatePresignedUrlAsync(
	baseUrl: string,
	payload: PresignedUrlPayload,
	secret: string,
): Promise<string> {
	const payloadJson = JSON.stringify(payload);
	const payloadB64 = base64UrlEncode(payloadJson);
	const signature = await hmacSign(payloadB64, secret);
	const token = `${payloadB64}.${signature}`;

	return `${baseUrl}/collab/${payload.roomId}?token=${encodeURIComponent(token)}`;
}

/**
 * Validate and decode pre-signed URL token.
 * Returns null if invalid or expired.
 */
export async function validatePresignedUrlAsync(
	token: string,
	secret: string,
): Promise<PresignedUrlPayload | null> {
	try {
		const parts = token.split(".");
		if (parts.length !== 2) return null;

		const payloadB64 = parts[0];
		const signature = parts[1];

		// Type guard after length check
		if (!payloadB64 || !signature) return null;

		// Verify signature
		const isValid = await hmacVerify(payloadB64, signature, secret);
		if (!isValid) return null;

		// Decode payload
		const payloadJson = base64UrlDecode(payloadB64);
		const payload = JSON.parse(payloadJson) as PresignedUrlPayload;

		// Validate required fields
		if (
			!payload.roomId ||
			!payload.taskId ||
			!payload.inviterId ||
			!payload.exp
		) {
			return null;
		}

		// Check expiration
		if (Date.now() > payload.exp) {
			return null;
		}

		return payload;
	} catch {
		return null;
	}
}

// ============ Internal helpers ============

function base64UrlEncode(str: string): string {
	const base64 = btoa(str);
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
	let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
	const padding = base64.length % 4;
	if (padding) {
		base64 += "=".repeat(4 - padding);
	}
	return atob(base64);
}
