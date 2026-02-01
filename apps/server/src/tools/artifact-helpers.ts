/**
 * Shared helpers for artifact operations.
 * Extracted to reduce cognitive complexity in add-artifact.ts.
 */
import { readFile } from "node:fs/promises";
import type {
	Artifact,
	ArtifactType,
	GitHubArtifact,
	LocalArtifact,
} from "@shipyard/schema";
import { nanoid } from "nanoid";
import { isGitHubConfigured, uploadArtifact } from "../github-artifacts.js";
import { deleteLocalArtifact, storeLocalArtifact } from "../local-artifacts.js";
import { logger } from "../logger.js";

/** --- Content Resolution Types --- */

interface FileSource {
	source: "file";
	filePath: string;
}

interface UrlSource {
	source: "url";
	contentUrl: string;
}

interface Base64Source {
	source: "base64";
	content: string;
}

export type ContentSource = FileSource | UrlSource | Base64Source;

export type ContentResult =
	| { success: true; content: string }
	| { success: false; error: string };

/**
 * Resolves artifact content from various sources (file, url, base64).
 * Returns base64-encoded content or an error message.
 */
export async function resolveArtifactContent(
	input: ContentSource,
): Promise<ContentResult> {
	switch (input.source) {
		case "file": {
			logger.info({ filePath: input.filePath }, "Reading file from path");
			try {
				const fileBuffer = await readFile(input.filePath);
				return { success: true, content: fileBuffer.toString("base64") };
			} catch (error) {
				logger.error(
					{ error, filePath: input.filePath },
					"Failed to read file",
				);
				const message =
					error instanceof Error ? error.message : "Unknown error";
				return { success: false, error: `Failed to read file: ${message}` };
			}
		}

		case "url": {
			logger.info(
				{ contentUrl: input.contentUrl },
				"Fetching content from URL",
			);
			try {
				const response = await fetch(input.contentUrl);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}
				const arrayBuffer = await response.arrayBuffer();
				return {
					success: true,
					content: Buffer.from(arrayBuffer).toString("base64"),
				};
			} catch (error) {
				logger.error(
					{ error, contentUrl: input.contentUrl },
					"Failed to fetch URL",
				);
				const message =
					error instanceof Error ? error.message : "Unknown error";
				return { success: false, error: `Failed to fetch URL: ${message}` };
			}
		}

		case "base64": {
			return { success: true, content: input.content };
		}
	}
}

/** --- Upload Strategy Types --- */

interface UploadParams {
	planId: string;
	filename: string;
	content: string;
	validatedType: ArtifactType;
	description?: string;
	repo?: string;
}

export interface UploadResult {
	artifact: Artifact;
	cleanupOnFailure: (() => Promise<void>) | null;
}

/**
 * Uploads artifact with fallback strategy: GitHub first, then local.
 * Returns the artifact and an optional cleanup function for rollback.
 */
export async function uploadArtifactWithFallback(
	params: UploadParams,
): Promise<UploadResult> {
	const { planId, filename, content, validatedType, description, repo } =
		params;
	const githubConfigured = isGitHubConfigured();
	const hasRepo = !!repo;

	if (githubConfigured && hasRepo) {
		try {
			/** Try GitHub upload */
			const url = await uploadArtifact({
				repo: repo,
				planId,
				filename,
				content,
			});

			const artifact: GitHubArtifact = {
				id: nanoid(),
				type: validatedType,
				filename,
				storage: "github",
				url,
				description,
				uploadedAt: Date.now(),
			};

			logger.info(
				{ planId, artifactId: artifact.id },
				"Artifact uploaded to GitHub",
			);
			/** No cleanup needed for GitHub - artifacts persist independently */
			return { artifact, cleanupOnFailure: null };
		} catch (error) {
			/** GitHub upload failed - fall back to local */
			logger.warn(
				{ error, planId },
				"GitHub upload failed, falling back to local storage",
			);
			return storeLocally(params, "GitHub fallback");
		}
	}

	/** Use local storage directly */
	const reason = !githubConfigured ? "GitHub not configured" : "No repo set";
	return storeLocally(params, reason);
}

/**
 * Stores artifact locally and returns cleanup handler.
 */
async function storeLocally(
	params: UploadParams,
	reason: string,
): Promise<UploadResult> {
	const { planId, filename, content, validatedType, description } = params;

	const buffer = Buffer.from(content, "base64");
	const localArtifactId = await storeLocalArtifact(planId, filename, buffer);

	const artifact: LocalArtifact = {
		id: nanoid(),
		type: validatedType,
		filename,
		storage: "local",
		localArtifactId,
		description,
		uploadedAt: Date.now(),
	};

	/** Set cleanup handler for local artifacts */
	const cleanupOnFailure = async () => {
		await deleteLocalArtifact(localArtifactId);
	};

	logger.info(
		{ planId, artifactId: artifact.id, reason },
		"Artifact stored locally",
	);
	return { artifact, cleanupOnFailure };
}
