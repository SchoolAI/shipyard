/**
 * Tests for start-agent-with-context protocol handler.
 * Validates A2A payload handling and session file creation flow.
 */

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { A2AMessage, ConversationExportMeta } from '@shipyard/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { ServerMessage } from './types.js';

/**
 * Sample A2A message fixture for testing.
 */
const sampleA2AMessages: A2AMessage[] = [
	{
		messageId: 'msg-001',
		role: 'user',
		parts: [
			{
				type: 'text',
				text: 'Can you read the package.json file?',
			},
		],
		contextId: 'test-context',
	},
	{
		messageId: 'msg-002',
		role: 'agent',
		parts: [
			{
				type: 'text',
				text: "I'll read the package.json file for you.",
			},
			{
				type: 'data',
				data: {
					toolUse: {
						id: 'tool-001',
						name: 'Read',
						input: { file_path: '/project/package.json' },
					},
				},
			},
		],
		contextId: 'test-context',
	},
];

const sampleMeta: ConversationExportMeta = {
	exportId: 'export-123',
	sourcePlatform: 'claude-code',
	sourceSessionId: 'session-456',
	planId: 'plan-789',
	exportedAt: Date.now(),
	messageCount: 2,
	compressedBytes: 1024,
	uncompressedBytes: 2048,
};

function createMockWebSocket(): {
	ws: WebSocket;
	messages: ServerMessage[];
} {
	const messages: ServerMessage[] = [];
	const ws = {
		readyState: WebSocket.OPEN,
		OPEN: WebSocket.OPEN,
		send: vi.fn((data: string) => {
			messages.push(JSON.parse(data));
		}),
	} as unknown as WebSocket;

	return { ws, messages };
}

function createMockChildProcess(): ChildProcess {
	const mockProcess = new EventEmitter() as ChildProcess;
	mockProcess.pid = 12345;
	mockProcess.stdout = new EventEmitter() as NonNullable<ChildProcess['stdout']>;
	mockProcess.stderr = new EventEmitter() as NonNullable<ChildProcess['stderr']>;
	mockProcess.kill = vi.fn();
	return mockProcess;
}

describe('start-agent-with-context handler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('handles valid A2A payload and spawns agent', async () => {
		const mockChild = createMockChildProcess();

		vi.doMock('./agent-spawner.js', () => ({
			spawnClaudeCode: vi.fn(),
			spawnClaudeCodeWithContext: vi.fn(async () => ({ child: mockChild, sessionId: 'test-session-123' })),
			stopAgent: vi.fn(),
			listAgents: vi.fn(() => []),
		}));

		const { handleClientMessage } = await import('./protocol.js');
		const { ws, messages } = createMockWebSocket();

		const message = JSON.stringify({
			type: 'start-agent-with-context',
			taskId: 'task-123',
			cwd: '/tmp',
			a2aPayload: {
				messages: sampleA2AMessages,
				meta: sampleMeta,
			},
		});

		await handleClientMessage(ws, message);

		/** Wait for async handler to complete */
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			type: 'started',
			taskId: 'task-123',
			pid: 12345,
			sessionId: 'test-session-123',
		});
	});

	it('streams output from agent process', async () => {
		const mockChild = createMockChildProcess();

		vi.doMock('./agent-spawner.js', () => ({
			spawnClaudeCode: vi.fn(),
			spawnClaudeCodeWithContext: vi.fn(async () => ({ child: mockChild, sessionId: 'test-session-123' })),
			stopAgent: vi.fn(),
			listAgents: vi.fn(() => []),
		}));

		const { handleClientMessage } = await import('./protocol.js');
		const { ws, messages } = createMockWebSocket();

		const message = JSON.stringify({
			type: 'start-agent-with-context',
			taskId: 'task-123',
			cwd: '/tmp',
			a2aPayload: {
				messages: sampleA2AMessages,
				meta: sampleMeta,
			},
		});

		await handleClientMessage(ws, message);

		/** Wait for handler setup */
		await new Promise((resolve) => setTimeout(resolve, 100));

		mockChild.stdout?.emit('data', Buffer.from('Agent output\n'));

		expect(messages).toContainEqual({
			type: 'output',
			taskId: 'task-123',
			data: 'Agent output\n',
			stream: 'stdout',
		});
	});

	it('sends completion event on agent exit', async () => {
		const mockChild = createMockChildProcess();

		vi.doMock('./agent-spawner.js', () => ({
			spawnClaudeCode: vi.fn(),
			spawnClaudeCodeWithContext: vi.fn(async () => ({ child: mockChild, sessionId: 'test-session-123' })),
			stopAgent: vi.fn(),
			listAgents: vi.fn(() => []),
		}));

		const { handleClientMessage } = await import('./protocol.js');
		const { ws, messages } = createMockWebSocket();

		const message = JSON.stringify({
			type: 'start-agent-with-context',
			taskId: 'task-123',
			cwd: '/tmp',
			a2aPayload: {
				messages: sampleA2AMessages,
				meta: sampleMeta,
			},
		});

		await handleClientMessage(ws, message);
		await new Promise((resolve) => setTimeout(resolve, 100));

		mockChild.emit('exit', 0);

		expect(messages).toContainEqual({
			type: 'completed',
			taskId: 'task-123',
			exitCode: 0,
		});
	});

	it('sends error when spawn fails with no pid', async () => {
		const mockChild = createMockChildProcess();
		mockChild.pid = undefined;

		vi.doMock('./agent-spawner.js', () => ({
			spawnClaudeCode: vi.fn(),
			spawnClaudeCodeWithContext: vi.fn(async () => ({ child: mockChild, sessionId: 'test-session-123' })),
			stopAgent: vi.fn(),
			listAgents: vi.fn(() => []),
		}));

		const { handleClientMessage } = await import('./protocol.js');
		const { ws, messages } = createMockWebSocket();

		const message = JSON.stringify({
			type: 'start-agent-with-context',
			taskId: 'task-123',
			cwd: '/tmp',
			a2aPayload: {
				messages: sampleA2AMessages,
				meta: sampleMeta,
			},
		});

		await handleClientMessage(ws, message);
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			type: 'error',
			taskId: 'task-123',
			message: 'Failed to spawn Claude Code process with context',
		});
	});

	it('sends error when spawner throws', async () => {
		vi.doMock('./agent-spawner.js', () => ({
			spawnClaudeCode: vi.fn(),
			spawnClaudeCodeWithContext: vi.fn(async () => {
				throw new Error('Spawn failed');
			}),
			stopAgent: vi.fn(),
			listAgents: vi.fn(() => []),
		}));

		const { handleClientMessage } = await import('./protocol.js');
		const { ws, messages } = createMockWebSocket();

		const message = JSON.stringify({
			type: 'start-agent-with-context',
			taskId: 'task-123',
			cwd: '/tmp',
			a2aPayload: {
				messages: sampleA2AMessages,
				meta: sampleMeta,
			},
		});

		await handleClientMessage(ws, message);
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			type: 'error',
			taskId: 'task-123',
			message: expect.stringContaining('Spawn failed'),
		});
	});
});
