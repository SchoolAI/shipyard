# ADR 0001: Use Yjs + BlockNote Instead of Loro-Extended

## Status

**Accepted** (2026-01-02)

## Context

Initially planned to use loro-extended for CRDT synchronization based on design/technical-brief.md:

**Reasons for considering loro-extended:**
- Cleaner typed API using Shape schemas
- Built by peer at SchoolAI (Duane Johnson - direct support available)
- WebSocket/WebRTC adapters included out of box
- React hooks (`useHandle`, `useDoc`) for easier integration
- Successful spike validated WebSocket sync works in Node.js

**Research findings:**
- BlockNote provides excellent Notion-like block editor with comments built-in
- BlockNote is Yjs-native with tight integration (uses Y.Doc, Y.XmlFragment internally)
- BlockNote's YjsThreadStore provides comment sync automatically
- loro-extended would only handle plan metadata (small portion of app)
- Running two CRDT systems (Yjs for content + Loro for metadata) adds unnecessary complexity

**Key insight from research:**
- BlockNote's comment system already solves our annotation requirements
- Comments don't have collisions (append-only, CRDT by nature)
- Hybrid approach would mean maintaining two sync layers

## Decision

Use **pure Yjs + BlockNote** for all collaborative features:

| Component | Technology |
|-----------|-----------|
| Block editing | BlockNote (Yjs-native) |
| CRDT sync | Yjs (all data) |
| Server sync | y-websocket |
| P2P sync | y-webrtc |
| Browser storage | y-indexeddb |
| Comments | BlockNote's YjsThreadStore |

**Data model:**
- Single Y.Doc contains:
  - BlockNote content (managed by BlockNote)
  - Plan metadata in Y.Map (managed by us)
  - Comments in Y.Map (managed by BlockNote)

## Consequences

### Positive

- **Simpler architecture**: One CRDT system instead of two
- **Comments included**: YjsThreadStore handles threaded comments, reactions, resolution
- **Faster development**: Use BlockNote as-is, no custom editor needed
- **Mature ecosystem**: Yjs is battle-tested in production (Figma, Notion use CRDTs)
- **Block-anchored comments**: Native support for anchoring comments to specific blocks

### Negative

- **Less typed than loro-extended**: Y.Map is untyped, requires runtime validation
- **Can't leverage SchoolAI connection**: Less access to Duane's loro-extended expertise
- **Yjs API learning curve**: More verbose than loro-extended's Shape API

### Mitigations

- **Type safety**: TypeScript wrappers around Y.Map with Zod schema validation
- **Runtime checks**: Use Zod schemas for all Y.Map reads/writes
- **Helper functions**: Abstract Yjs API behind typed utilities (see packages/schema/src/yjs-helpers.ts)

## Alternative Considered

**Hybrid approach** (Yjs for content + Loro for metadata):
- Rejected due to complexity of maintaining two CRDT systems
- Loro Protocol supports Yjs via magic bytes (%YJS, %YAW), but adds abstraction layer
- Would only use Loro for ~10% of the data (metadata), not worth the complexity

## References

- Research: agents/a803639, agents/abac1f0, agents/a1c7e01
- Spike: spikes/loro-websocket/ (validated loro-extended works)
- BlockNote docs: https://www.blocknotejs.org/docs/features/collaboration
- Yjs docs: https://docs.yjs.dev/

## Revisit Criteria

Consider revisiting if:
- BlockNote's comment system proves insufficient for our needs
- Yjs type safety becomes a maintenance burden
- Performance issues arise that Loro would solve

---

*Created: 2026-01-02*
