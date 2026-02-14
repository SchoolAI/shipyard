# Backend Expert Memory

## node-datachannel in daemon
- `node-datachannel` native addon needs build scripts enabled (`.npmrc` `enabled-scripts` or `pnpm approve-builds`)
- Run `npm run install` inside the package dir if prebuild-install was skipped
- The `/polyfill` subpath exports W3C-compatible `RTCPeerConnection`, `RTCDataChannelEvent`, `RTCPeerConnectionIceEvent`
- Daemon tsconfig uses `lib: ["ES2022"]` (no `dom`), so global WebRTC types don't exist
- Solution: Define `MinimalPeerConnection` interface + inject via `createPeerConnection` config parameter
- `PeerID` from `loro-crdt` is `` `${number}` `` template literal type; use `as unknown as PeerID` for machineId strings

## loro-extended version alignment
- All `@loro-extended/*` packages MUST be same minor version to avoid `#private` field TypeScript errors
- The `Adapter` base class has private fields; version mismatch between repo and adapter causes TS2741
- Current working version: all at `^5.4.2` in pnpm-workspace.yaml catalog

## Schema architecture
- `packages/session/src/schemas.ts` is the canonical schema source for both client and server
- Session server imports from `@shipyard/session`; its local `client/schemas.ts` is a separate client-only copy
- PersonalRoom DO: `PersonalRoomClientMessageSchema` validates incoming WS messages
- Server relays messages raw via `relayMessage()` (JSON.stringify), so relayed message types must exist in BOTH client AND server schemas
- `SpawnAgentSchema` added to `PersonalRoomServerMessageSchema` so daemon can receive relayed spawn-agent
- `SpawnResultSchema` added to `PersonalRoomClientMessageSchema` so daemon can send spawn-result back

## PersonalRoom DO spawn flow
1. Browser sends `spawn-agent` (client msg) -> server validates, relays raw to daemon WS
2. Daemon receives as `PersonalRoomServerMessage` (must be in server schema)
3. Daemon sends `spawn-result` (client msg) -> server validates, relays to browser WS
4. Browser receives as `PersonalRoomServerMessage` (already was there)

## Testing patterns
- Daemon tests use vitest with `globals: true`
- For native modules like node-datachannel, prefer dependency injection over vi.mock
- `createPeerConnection` factory parameter avoids ESM mock complexity
