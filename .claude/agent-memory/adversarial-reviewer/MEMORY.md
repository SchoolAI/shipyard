# Adversarial Reviewer Memory

## Project Architecture
- **CRDT engine**: Loro via `loro-extended` (NOT Yjs)
- **Sync**: WebRTC for peer-to-peer CRDT sync, WebSocket signaling via Cloudflare Durable Objects
- **Schema**: `packages/loro-schema/src/shapes.ts` defines all CRDT document shapes
- **Session schemas**: `packages/session/src/schemas.ts` defines all signaling WebSocket message schemas
- **Daemon**: `apps/daemon/src/serve.ts` is the main daemon entry point
- **Session server**: `apps/session-server/src/durable-objects/personal-room.ts` relays messages

## Common Patterns to Check
- **Loro Handle subscriptions**: Must be stored and cleaned up on shutdown. `handle.subscribe()` returns an unsubscribe function.
- **Schema changes**: Adding fields to Loro shapes (e.g., SessionEntryShape) breaks ALL test files that push entries without the new field -- TypeScript enforces this. Always grep for `.push({` in test files after adding a required field.
- **ActiveTask interface vs usage**: The ActiveTask interface in serve.ts can drift from actual usage. Object literal excess property checks will catch this at compile time.
- **`waitForSync({ kind: 'storage' })`**: Only waits for local storage, NOT network sync. New tasks won't have local storage data.
- **Race conditions in subscription callbacks**: Loro fires subscription callbacks synchronously after import. Guard with `activeTasks.has()` before spawning.
- **Follow-up message handling**: When meta.status === 'working', subscription callbacks bail out. After task completion, there is no automatic re-check for queued user messages. This is a known design gap.
- **Browser CRDT writes on submit**: The browser's handleSubmit overwrites ALL meta fields every time, including createdAt. Follow-up messages should only update updatedAt and push conversation entries.
- **watchedTasks cleanup**: Fixed -- watchedTasks now cleaned up in `runTask().finally()` (serve.ts:486-494).
- **Task index cross-doc consistency**: Daemon updates TaskDocument status but does NOT update the room's TaskIndex. Only the browser writes to TaskIndex. This means sidebar status goes stale unless the browser re-derives from task docs.
- **Epoch mismatch**: Browser hardcodes `DEFAULT_EPOCH` for task doc IDs. Daemon uses `loadEpoch()` which reads from storage. If epoch ever changes, they will create different doc IDs and never sync.

## Key Files
- Daemon serve: `/Users/jacobpetterle/Working Directory/shipyard/apps/daemon/src/serve.ts`
- Session manager: `/Users/jacobpetterle/Working Directory/shipyard/apps/daemon/src/session-manager.ts`
- Loro shapes: `/Users/jacobpetterle/Working Directory/shipyard/packages/loro-schema/src/shapes.ts`
- Session schemas: `/Users/jacobpetterle/Working Directory/shipyard/packages/session/src/schemas.ts`
- Personal room DO: `/Users/jacobpetterle/Working Directory/shipyard/apps/session-server/src/durable-objects/personal-room.ts`
