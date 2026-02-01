import { z } from "zod";

/**
 * Zod schema for comment body - can be a string or structured content.
 * BlockNote stores comment bodies as arrays of block content.
 */
export const CommentBodySchema = z.union([z.string(), z.array(z.unknown())]);

/**
 * BlockNote comment content - can be a string or structured content.
 * Schema is source of truth - type derived via z.infer.
 */
export type CommentBody = z.infer<typeof CommentBodySchema>;

/**
 * Zod schema for thread comment validation.
 */
export const ThreadCommentSchema = z.object({
	id: z.string(),
	userId: z.string(),
	body: CommentBodySchema,
	createdAt: z.number(),
});

/**
 * Individual comment within a thread.
 * Schema is source of truth - type derived via z.infer.
 */
export type ThreadComment = z.infer<typeof ThreadCommentSchema>;

/**
 * Zod schema for thread validation.
 */
export const ThreadSchema = z.object({
	id: z.string(),
	comments: z.array(ThreadCommentSchema),
	resolved: z.boolean().optional(),
	selectedText: z.string().optional(),
});

/**
 * Comment thread on a plan block.
 * Schema is source of truth - type derived via z.infer.
 */
export type Thread = z.infer<typeof ThreadSchema>;

/**
 * Type guard for checking if a value is a valid Thread.
 */
export function isThread(value: unknown): value is Thread {
	return ThreadSchema.safeParse(value).success;
}

/**
 * Safely parse threads from Y.Map data.
 * Returns only valid threads, silently dropping invalid ones.
 */
export function parseThreads(data: Record<string, unknown>): Thread[] {
	const threads: Thread[] = [];
	for (const [_key, value] of Object.entries(data)) {
		const result = ThreadSchema.safeParse(value);
		if (result.success) {
			threads.push(result.data);
		}
	}
	return threads;
}

/**
 * Extract plain text from BlockNote comment body.
 * Handles both string and structured block content.
 */
export function extractTextFromCommentBody(body: CommentBody): string {
	if (typeof body === "string") {
		return body;
	}

	if (!Array.isArray(body)) {
		return "";
	}

	return body
		.map((block) => {
			if (typeof block === "string") return block;
			if (typeof block !== "object" || block === null) return "";

			const blockObj = Object.fromEntries(Object.entries(block));
			const content = blockObj.content;
			if (Array.isArray(content)) {
				return content
					.map((item: unknown) => {
						if (typeof item === "string") return item;
						if (typeof item === "object" && item !== null && "text" in item) {
							const textItem = Object.fromEntries(Object.entries(item));
							const text = textItem.text;
							return typeof text === "string" ? text : "";
						}
						return "";
					})
					.join("");
			}

			return "";
		})
		.join("\n");
}

/**
 * Extract @mentions from comment body.
 * Looks for patterns like @username in the text.
 *
 * @param body - Comment body (string or structured content)
 * @returns Array of mentioned GitHub usernames (without @ prefix)
 */
export function extractMentions(body: CommentBody): string[] {
	const text = extractTextFromCommentBody(body);
	const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
	const mentions = [...text.matchAll(mentionRegex)]
		.map((match) => match[1])
		.filter((username): username is string => username !== undefined);

	return [...new Set(mentions)];
}
