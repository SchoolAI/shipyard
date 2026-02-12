# A2A Protocol — Gotchas

1. **Message vs Task response**: `sendMessage` can return EITHER a `Message` or a `Task`. Always check `result.kind`.

2. **A2AClient is deprecated**: Use `ClientFactory` + `Client` instead. The old client returns JSON-RPC envelopes; the new one returns unwrapped results.

3. **eventBus.finished() is required**: Your executor MUST call `finished()` or the request hangs (especially blocking requests).

4. **Server generates IDs**: `taskId` and `contextId` are server-generated. Clients cannot create their own task IDs.

5. **Blocking vs non-blocking**: Default is blocking (`configuration.blocking: true`). Non-blocking returns immediately; poll/stream/webhook for updates.

6. **gRPC requires extra deps**: `@grpc/grpc-js` and `@bufbuild/protobuf` are peer dependencies.

7. **Express is a peer dep**: Must install `express` separately for server usage.

8. **Streaming fallback**: If agent card says `streaming: false`, `sendMessageStream()` automatically falls back to non-streaming and yields a single result.

9. **Multi-turn**: Use `contextId` to group related interactions. Use `taskId` on message to continue existing task. Use `referenceTaskIds` for cross-task references.

10. **EventBus is web-compatible**: Uses `EventTarget` (not Node.js EventEmitter) — works in browsers, Cloudflare Workers, Deno, Bun.

11. **Types file is auto-generated**: `src/types.ts` is generated from JSON Schema. Has duplicate interfaces due to code generation.

12. **Version header**: Clients should send `A2A-Version: 0.3` header. Empty = assumed 0.3.
