# MCP Protocol — Gotchas

1. **Two kinds of errors for tools.** Protocol errors (JSON-RPC `-326xx`) are for structural issues (unknown tool, bad params). Tool execution errors use `isError: true` in the result — these go back to the LLM for self-correction. Don't conflate them.

2. **Capability negotiation is mandatory.** Both sides MUST declare capabilities during `initialize`. You cannot use tools if the server didn't declare `tools` capability. You cannot sample if the client didn't declare `sampling` capability.

3. **`notifications/initialized` must be sent.** After receiving the `InitializeResult`, the client MUST send `notifications/initialized` before normal operations begin. Servers SHOULD NOT send requests before receiving it.

4. **Streamable HTTP replaces HTTP+SSE.** The old transport from protocol version 2024-11-05 used separate SSE and POST endpoints. The new Streamable HTTP uses a single MCP endpoint for both POST and GET. Backwards-compat is documented in the transports spec.

5. **Validate `Origin` header on Streamable HTTP.** Without this, DNS rebinding attacks can hit local MCP servers from remote websites. Bind to localhost (127.0.0.1) for local servers.

6. **`MCP-Session-Id` is required after init.** If a server returns this header in the initialize response, the client MUST include it on all subsequent requests. Missing it gets HTTP 400.

7. **`MCP-Protocol-Version` header required on HTTP.** Client MUST send `MCP-Protocol-Version: 2025-11-25` on all HTTP requests after initialization.

8. **Tool annotations are untrusted.** `ToolAnnotations` (readOnlyHint, destructiveHint, etc.) are hints from the server. Clients MUST NOT trust them from untrusted servers.

9. **`inputSchema` must be an object type.** A tool's `inputSchema.type` MUST be `"object"`. For no-param tools, use `{ "type": "object", "additionalProperties": false }`.

10. **Sampling tool results must be isolated.** When a user message contains `tool_result` content, it MUST contain ONLY tool results. No mixing with text/image/audio in the same message.

11. **Every `tool_use` needs a matching `tool_result`.** Before continuing conversation after an assistant message with `ToolUseContent`, each tool use (by `id`) must be matched by a `ToolResultContent` (by `toolUseId`).

12. **Form elicitation cannot collect sensitive data.** Passwords, API keys, credentials MUST use URL mode elicitation, not form mode. Form data passes through the client.

13. **Tasks are experimental (2025-11-25).** The tasks feature is new. Tasks always start in `working` status. Terminal states (`completed`, `failed`, `cancelled`) cannot transition further.

14. **`tasks/result` blocks until terminal.** If the task is still `working`, the `tasks/result` call blocks until it reaches a terminal state. Use `tasks/get` for polling.

15. **Task `ttl` is from creation, not completion.** The receiver may delete the task after `ttl` milliseconds from `createdAt`, regardless of status. Retrieve results before expiry.

16. **Related task metadata key is namespaced.** Use `_meta["io.modelcontextprotocol/related-task"]` with `{ taskId }` to associate messages with tasks.

17. **stdio: no embedded newlines.** Messages are newline-delimited. A single JSON-RPC message MUST NOT contain newlines.

18. **stdio: don't write non-MCP to stdout.** Server MUST NOT write anything to stdout that isn't a valid MCP message. Use stderr for logging.

19. **Resource URIs are opaque.** The server decides how to interpret resource URIs. `file://` doesn't need to map to a real filesystem.

20. **`includeContext` in sampling is soft-deprecated.** `"thisServer"` and `"allServers"` values should only be used if the client declares `sampling.context` capability. Default to `"none"` or omit.
