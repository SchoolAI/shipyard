/**
 * execute_code VM sandbox.
 *
 * Creates isolated execution context for user code with access to Shipyard APIs.
 * Ported from apps/server-legacy/src/tools/execute-code.ts sandbox logic.
 */

import type { Context as VmContext } from "node:vm";

/**
 * Sandbox context with Shipyard API wrappers.
 */
export interface SandboxContext extends VmContext {
	createTask: typeof import("./api-wrappers.js").createTask;
	readTask: typeof import("./api-wrappers.js").readTask;
	updateTask: typeof import("./api-wrappers.js").updateTask;
	addArtifact: typeof import("./api-wrappers.js").addArtifact;
	completeTask: typeof import("./api-wrappers.js").completeTask;
	updateBlockContent: typeof import("./api-wrappers.js").updateBlockContent;
	linkPR: typeof import("./api-wrappers.js").linkPR;
	postUpdate: typeof import("./api-wrappers.js").postUpdate;
	readDiffComments: typeof import("./api-wrappers.js").readDiffComments;
	replyToDiffComment: typeof import("./api-wrappers.js").replyToDiffComment;
	replyToThreadComment: typeof import("./api-wrappers.js").replyToThreadComment;
	regenerateSessionToken: typeof import("./api-wrappers.js").regenerateSessionToken;
	requestUserInput: typeof import("./input-request.js").requestUserInput;
	console: {
		log: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
}

/**
 * Create a sandbox context with all Shipyard APIs available.
 */
export function createSandboxContext(): SandboxContext {
	// TODO: Implement sandbox context creation
	// Import all API wrappers and bind to context
	throw new Error("Not implemented");
}

/**
 * Execute code in the sandbox context.
 */
export async function executeInSandbox(
	_code: string,
	_context: SandboxContext,
): Promise<unknown> {
	// TODO: Implement VM execution
	// const wrappedCode = `(async () => { ${code} })()`
	// const script = new vm.Script(wrappedCode)
	// return script.runInContext(context, { timeout: 120000 })
	throw new Error("Not implemented");
}
