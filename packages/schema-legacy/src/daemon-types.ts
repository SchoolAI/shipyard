/**
 * TypeScript types for daemon WebSocket protocol.
 * Shared between daemon server and web client.
 */

import { z } from "zod";
import {
	type A2AMessage,
	A2AMessageSchema,
	type ConversationExportMeta,
	ConversationExportMetaSchema,
} from "./conversation-export.js";

/**
 * Schema for start-agent message
 */
const StartAgentMessageSchema = z.object({
	type: z.literal("start-agent"),
	taskId: z.string().min(1, "taskId is required"),
	prompt: z.string(),
	cwd: z.string().optional(),
});

/**
 * Schema for stop-agent message
 */
const StopAgentMessageSchema = z.object({
	type: z.literal("stop-agent"),
	taskId: z.string().min(1, "taskId is required"),
});

/**
 * Schema for list-agents message
 */
const ListAgentsMessageSchema = z.object({
	type: z.literal("list-agents"),
});

/**
 * Schema for A2A payload (messages + meta)
 */
const A2APayloadSchema = z.object({
	messages: z.array(A2AMessageSchema),
	meta: ConversationExportMetaSchema,
});

/**
 * Schema for start-agent-with-context message
 */
const StartAgentWithContextMessageSchema = z.object({
	type: z.literal("start-agent-with-context"),
	taskId: z.string().min(1, "taskId is required"),
	cwd: z.string().min(1, "cwd is required"),
	a2aPayload: A2APayloadSchema,
});

/**
 * Discriminated union schema for all client messages.
 * Used for validating incoming WebSocket messages.
 */
export const ClientMessageSchema = z.discriminatedUnion("type", [
	StartAgentMessageSchema,
	StopAgentMessageSchema,
	ListAgentsMessageSchema,
	StartAgentWithContextMessageSchema,
]);

export type ClientMessage =
	| { type: "start-agent"; taskId: string; prompt: string; cwd?: string }
	| { type: "stop-agent"; taskId: string }
	| { type: "list-agents" }
	| {
			type: "start-agent-with-context";
			taskId: string;
			cwd: string;
			a2aPayload: {
				messages: A2AMessage[];
				meta: ConversationExportMeta;
			};
	  };

/**
 * Schema for 'started' server message
 */
const StartedMessageSchema = z.object({
	type: z.literal("started"),
	taskId: z.string(),
	pid: z.number(),
	sessionId: z.string().optional(),
});

/**
 * Schema for 'output' server message
 */
const OutputMessageSchema = z.object({
	type: z.literal("output"),
	taskId: z.string(),
	data: z.string(),
	stream: z.enum(["stdout", "stderr"]),
});

/**
 * Schema for 'completed' server message
 */
const CompletedMessageSchema = z.object({
	type: z.literal("completed"),
	taskId: z.string(),
	exitCode: z.number(),
});

/**
 * Schema for 'stopped' server message
 */
const StoppedMessageSchema = z.object({
	type: z.literal("stopped"),
	taskId: z.string(),
});

/**
 * Schema for 'agents' server message
 */
const AgentsMessageSchema = z.object({
	type: z.literal("agents"),
	list: z.array(
		z.object({
			taskId: z.string(),
			pid: z.number(),
			uptime: z.number().optional(),
		}),
	),
});

/**
 * Schema for 'error' server message
 */
const ErrorMessageSchema = z.object({
	type: z.literal("error"),
	taskId: z.string().optional(),
	message: z.string(),
});

/**
 * Discriminated union schema for all server messages.
 * Used for validating incoming WebSocket messages from daemon.
 */
export const ServerMessageSchema = z.discriminatedUnion("type", [
	StartedMessageSchema,
	OutputMessageSchema,
	CompletedMessageSchema,
	StoppedMessageSchema,
	AgentsMessageSchema,
	ErrorMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
