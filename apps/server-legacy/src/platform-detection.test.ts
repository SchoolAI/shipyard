import { getPlatformDisplayName } from "@shipyard/schema";
import { afterEach, describe, expect, it } from "vitest";
import {
	getClientInfo,
	resetClientInfo,
	setClientInfo,
} from "./mcp-client-info.js";
import {
	detectPlatform,
	detectPlatformFromClientInfo,
	detectPlatformFromEnvironment,
	getDisplayName,
} from "./platform-detection.js";

describe("detectPlatformFromClientInfo", () => {
	it("detects Claude Code", () => {
		expect(detectPlatformFromClientInfo("claude-code")).toBe("claude-code");
	});

	it("detects Cursor", () => {
		expect(detectPlatformFromClientInfo("cursor-vscode")).toBe("cursor");
	});

	it("detects Windsurf", () => {
		expect(detectPlatformFromClientInfo("Windsurf")).toBe("windsurf");
	});

	it("detects Codex", () => {
		expect(detectPlatformFromClientInfo("Codex")).toBe("codex");
		expect(detectPlatformFromClientInfo("codex-mcp-client")).toBe("codex");
	});

	it("detects Aider", () => {
		expect(detectPlatformFromClientInfo("Aider")).toBe("aider");
	});

	it("detects Cline", () => {
		expect(detectPlatformFromClientInfo("Cline")).toBe("cline");
	});

	it("detects Continue", () => {
		expect(detectPlatformFromClientInfo("continue-cli-client")).toBe(
			"continue",
		);
	});

	it("detects VS Code", () => {
		expect(detectPlatformFromClientInfo("Visual Studio Code")).toBe("vscode");
	});

	it("detects Zed", () => {
		expect(detectPlatformFromClientInfo("Zed")).toBe("zed");
	});

	it("returns null for unknown clients", () => {
		expect(detectPlatformFromClientInfo("unknown-client")).toBeNull();
	});

	it("returns null for undefined", () => {
		expect(detectPlatformFromClientInfo(undefined)).toBeNull();
	});
});

describe("detectPlatformFromEnvironment", () => {
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
	});

	it("detects Claude Code from CLAUDECODE env", () => {
		process.env = { CLAUDECODE: "1" };
		expect(detectPlatformFromEnvironment()).toBe("claude-code");
	});

	it("detects Cursor from CURSOR_AGENT env", () => {
		process.env = { CURSOR_AGENT: "1" };
		expect(detectPlatformFromEnvironment()).toBe("cursor");
	});

	it("detects VS Code from VSCODE env vars", () => {
		process.env = { VSCODE_GIT_ASKPASS_MAIN: "/path/to/vscode" };
		expect(detectPlatformFromEnvironment()).toBe("vscode");
	});

	it("detects Cursor from VSCODE env with cursor in path", () => {
		process.env = {
			VSCODE_GIT_ASKPASS_MAIN: "/path/to/cursor",
			PATH: "/usr/bin:/cursor/bin",
		};
		expect(detectPlatformFromEnvironment()).toBe("cursor");
	});

	it("detects Windsurf from PATH", () => {
		process.env = { PATH: "/usr/bin:/windsurf/bin" };
		expect(detectPlatformFromEnvironment()).toBe("windsurf");
	});

	it("detects Codex from CODEX_HOME", () => {
		process.env = { CODEX_HOME: "/home/user/.codex" };
		expect(detectPlatformFromEnvironment()).toBe("codex");
	});

	it("detects Aider from AIDER_MODEL", () => {
		process.env = { AIDER_MODEL: "gpt-4" };
		expect(detectPlatformFromEnvironment()).toBe("aider");
	});

	it("detects Devin from DEVIN_SESSION_ID", () => {
		process.env = { DEVIN_SESSION_ID: "session-123" };
		expect(detectPlatformFromEnvironment()).toBe("devin");
	});

	it("returns null for empty environment", () => {
		process.env = {};
		expect(detectPlatformFromEnvironment()).toBeNull();
	});
});

describe("detectPlatform", () => {
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
	});

	it("prioritizes clientInfo over environment", () => {
		process.env = { CLAUDECODE: "1" };
		const result = detectPlatform("cursor-vscode");
		expect(result.platform).toBe("cursor");
		expect(result.displayName).toBe("Cursor");
	});

	it("falls back to environment when no clientInfo", () => {
		process.env = { CLAUDECODE: "1" };
		const result = detectPlatform(undefined);
		expect(result.platform).toBe("claude-code");
	});

	it("defaults to unknown when nothing detected", () => {
		process.env = {};
		const result = detectPlatform(undefined);
		expect(result.platform).toBe("unknown");
		expect(result.displayName).toBe("Agent");
	});

	it("returns correct display names", () => {
		expect(detectPlatform("claude-code").displayName).toBe("Claude Code");
		expect(detectPlatform("cursor-vscode").displayName).toBe("Cursor");
		expect(detectPlatform("Codex").displayName).toBe("Codex");
	});
});

describe("getDisplayName", () => {
	it("formats name with username", () => {
		expect(getDisplayName("claude-code", "alice")).toBe("Claude Code (alice)");
	});

	it("formats name without username", () => {
		expect(getDisplayName("claude-code", undefined)).toBe("Claude Code");
	});

	it("handles all platforms", () => {
		expect(getDisplayName("cursor", "bob")).toBe("Cursor (bob)");
		expect(getDisplayName("codex", "charlie")).toBe("Codex (charlie)");
		expect(getDisplayName("unknown", undefined)).toBe("Agent");
	});
});

describe("resetClientInfo", () => {
	afterEach(() => {
		resetClientInfo();
	});

	it("resets client info to undefined", () => {
		setClientInfo("claude-code");
		expect(getClientInfo()).toBe("claude-code");

		resetClientInfo();
		expect(getClientInfo()).toBeUndefined();
	});

	it("allows re-setting client info after reset", () => {
		setClientInfo("cursor");
		resetClientInfo();
		setClientInfo("windsurf");
		expect(getClientInfo()).toBe("windsurf");
	});
});

describe("getPlatformDisplayName security", () => {
	it("returns safe fallback for unknown platforms (XSS prevention)", () => {
		// Malicious input should not be echoed back
		expect(getPlatformDisplayName('<script>alert("xss")</script>')).toBe(
			"Unknown Agent",
		);
		expect(getPlatformDisplayName("javascript:alert(1)")).toBe("Unknown Agent");
		expect(getPlatformDisplayName('"><img src=x onerror=alert(1)>')).toBe(
			"Unknown Agent",
		);
	});

	it("returns correct display name for valid platforms", () => {
		expect(getPlatformDisplayName("claude-code")).toBe("Claude Code");
		expect(getPlatformDisplayName("cursor")).toBe("Cursor");
		expect(getPlatformDisplayName("unknown")).toBe("Agent");
	});

	it("does not return raw input for unrecognized values", () => {
		const maliciousInput = "malicious-platform-name";
		const result = getPlatformDisplayName(maliciousInput);
		expect(result).not.toBe(maliciousInput);
		expect(result).toBe("Unknown Agent");
	});
});
