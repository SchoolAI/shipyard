/**
 * Integration tests for agent spawner.
 *
 * Manages Claude Code child processes.
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Mock spawn */
const mockSpawn = vi.fn();
const mockExecSync = vi.fn();
const mockExistsSync = vi.fn();
const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();
const mockReadFile = vi.fn();

vi.mock("node:child_process", () => ({
	spawn: (...args: unknown[]) => mockSpawn(...args),
	execSync: (...args: unknown[]) => mockExecSync(...args),
}));

vi.mock("node:fs", () => ({
	existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

vi.mock("node:fs/promises", () => ({
	mkdir: (...args: unknown[]) => mockMkdir(...args),
	writeFile: (...args: unknown[]) => mockWriteFile(...args),
	readFile: (...args: unknown[]) => mockReadFile(...args),
}));

vi.mock("../utils/logger.js", () => ({
	getLogger: () => ({
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	}),
}));

/** Import after mocks are set up */
import {
	initSpawner,
	spawnClaudeCode,
	spawnClaudeCodeWithContext,
	stopAgent,
} from "./spawner.js";
import { getAgent, hasAgent, listAgents, untrackAgent } from "./tracker.js";

/**
 * Create a mock ChildProcess for testing.
 */
function createMockChildProcess(pid = 12345): ChildProcess {
	const emitter = new EventEmitter();
	const mockProcess = Object.assign(emitter, {
		pid,
		stdin: null,
		stdout: { pipe: vi.fn() },
		stderr: { pipe: vi.fn() },
		stdio: [null, null, null, null, null] as [null, null, null, null, null],
		killed: false,
		exitCode: null,
		signalCode: null,
		spawnargs: [],
		spawnfile: "",
		connected: false,
		kill: vi.fn(() => {
			(mockProcess as unknown as EventEmitter).emit("exit", 0);
			return true;
		}),
		send: vi.fn(() => true),
		disconnect: vi.fn(),
		unref: vi.fn(),
		ref: vi.fn(),
		[Symbol.dispose]: vi.fn(),
	}) as unknown as ChildProcess;
	return mockProcess;
}

/** Mock environment for testing */
const mockEnv = {
	PORT: 32191,
	LOG_LEVEL: "info" as const,
	WEB_URL: "http://localhost:3000",
	GITHUB_TOKEN: "test-token",
	DOCKER_MODE: false,
	CLAUDE_SHIM_LOG_DIR: "/tmp/shim-logs",
	CLAUDE_PROJECTS_DIR: "/tmp/claude-projects",
};

describe("Agent Spawner", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Initialize spawner with mock env
		initSpawner(mockEnv as Parameters<typeof initSpawner>[0]);
		// Mock common dependencies
		mockExecSync.mockReturnValue("/usr/local/bin/claude\n");
		mockExistsSync.mockReturnValue(false);
		mockMkdir.mockResolvedValue(undefined);
		mockWriteFile.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue("{}");
		// Clear any tracked agents
		for (const agent of listAgents()) {
			untrackAgent(agent.taskId);
		}
	});

	afterEach(() => {
		// Clean up any agents
		for (const agent of listAgents()) {
			untrackAgent(agent.taskId);
		}
	});

	describe("spawnClaudeCode", () => {
		it("spawns Claude Code child process", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			const child = await spawnClaudeCode({
				taskId: "task-spawn-1",
				prompt: "Test prompt",
				cwd: "/test/dir",
			});

			expect(mockSpawn).toHaveBeenCalled();
			expect(child).toBe(mockProcess);
		});

		it("passes prompt to Claude Code", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			await spawnClaudeCode({
				taskId: "task-prompt-1",
				prompt: "Implement the feature",
				cwd: "/test/dir",
			});

			const spawnArgs = mockSpawn.mock.calls[0]?.[1] as string[] | undefined;
			expect(spawnArgs).toBeDefined();
			expect(spawnArgs).toContain("-p");
			if (!spawnArgs) throw new Error("spawnArgs should be defined");
			const promptIndex = spawnArgs.indexOf("-p");
			expect(spawnArgs[promptIndex + 1]).toBe("Implement the feature");
		});

		it("sets working directory to cwd", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			await spawnClaudeCode({
				taskId: "task-cwd-1",
				prompt: "Test",
				cwd: "/custom/working/dir",
			});

			const spawnOptions = mockSpawn.mock.calls[0]?.[2] as
				| { cwd: string }
				| undefined;
			expect(spawnOptions?.cwd).toBe("/custom/working/dir");
		});

		it("configures MCP server args", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			await spawnClaudeCode({
				taskId: "task-mcp-1",
				prompt: "Test",
				cwd: "/test/dir",
			});

			const spawnArgs = mockSpawn.mock.calls[0]?.[1] as string[] | undefined;
			expect(spawnArgs).toContain("--dangerously-skip-permissions");
		});

		it("tracks spawned agent in registry", async () => {
			const mockProcess = createMockChildProcess(99999);
			mockSpawn.mockReturnValue(mockProcess);

			await spawnClaudeCode({
				taskId: "task-track-1",
				prompt: "Test",
				cwd: "/test/dir",
			});

			expect(hasAgent("task-track-1")).toBe(true);
			const agent = getAgent("task-track-1");
			expect(agent?.pid).toBe(99999);
		});

		it("returns ChildProcess handle", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			const child = await spawnClaudeCode({
				taskId: "task-return-1",
				prompt: "Test",
				cwd: "/test/dir",
			});

			expect(child.pid).toBe(12345);
			expect(typeof child.kill).toBe("function");
		});
	});

	describe("spawnClaudeCodeWithContext", () => {
		it("spawns with A2A conversation payload", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			const result = await spawnClaudeCodeWithContext({
				taskId: "task-a2a-1",
				cwd: "/test/dir",
				a2aPayload: {
					messages: [
						{
							messageId: "msg-1",
							role: "user",
							parts: [{ type: "text", text: "Hello" }],
						},
					],
					meta: { planId: "plan-123" },
				},
			});

			expect(mockWriteFile).toHaveBeenCalled();
			expect(result.child).toBe(mockProcess);
		});

		it("passes message history", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			await spawnClaudeCodeWithContext({
				taskId: "task-history-1",
				cwd: "/test/dir",
				a2aPayload: {
					messages: [
						{
							messageId: "msg-1",
							role: "user",
							parts: [{ type: "text", text: "First message" }],
						},
						{
							messageId: "msg-2",
							role: "agent",
							parts: [{ type: "text", text: "Response" }],
						},
					],
					meta: {},
				},
			});

			// Check that writeFile was called with JSONL content
			const writeFileCall = mockWriteFile.mock.calls[0];
			const content = writeFileCall?.[1] as string;
			expect(content).toContain("First message");
			expect(content).toContain("Response");
		});

		it("returns sessionId with child process", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			const result = await spawnClaudeCodeWithContext({
				taskId: "task-session-1",
				cwd: "/test/dir",
				a2aPayload: {
					messages: [
						{
							messageId: "msg-1",
							role: "user",
							parts: [{ type: "text", text: "Hello" }],
						},
					],
					meta: {},
				},
			});

			expect(result.sessionId).toBeDefined();
			expect(typeof result.sessionId).toBe("string");
			expect(result.sessionId.length).toBeGreaterThan(0);
			expect(result.child).toBe(mockProcess);
		});
	});

	describe("stopAgent", () => {
		it("kills running agent process", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			await spawnClaudeCode({
				taskId: "task-kill-1",
				prompt: "Test",
				cwd: "/test/dir",
			});

			expect(hasAgent("task-kill-1")).toBe(true);

			stopAgent("task-kill-1");

			expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
		});

		it("removes from tracker", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			await spawnClaudeCode({
				taskId: "task-remove-1",
				prompt: "Test",
				cwd: "/test/dir",
			});

			expect(hasAgent("task-remove-1")).toBe(true);

			stopAgent("task-remove-1");

			expect(hasAgent("task-remove-1")).toBe(false);
		});

		it("returns true when agent found and stopped", async () => {
			const mockProcess = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			await spawnClaudeCode({
				taskId: "task-found-1",
				prompt: "Test",
				cwd: "/test/dir",
			});

			const result = stopAgent("task-found-1");
			expect(result).toBe(true);
		});

		it("returns false when agent not found", () => {
			const result = stopAgent("non-existent-task");
			expect(result).toBe(false);
		});
	});
});
