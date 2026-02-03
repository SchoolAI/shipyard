# ADR 0007: Partial Bun Migration (Packages, Hook, Web Dev Only)

## Status

**Accepted** (2026-02-02)

## Context

During the Loro migration, we evaluated migrating from Node.js to Bun to gain performance benefits. Bun offers significant improvements in build times, startup times, and runtime performance for compatible components.

### Research Findings

Comprehensive analysis documented in `docs/whips/bun-migration-analysis.md` revealed:

**Performance gains:**
- CLI startup: 4x faster (200ms → 50ms)
- Package builds: 14-23x faster
- Web dev server: 29% faster (199ms → 141ms)
- HTTP throughput: 3.3x faster (Hono on Bun)

**Compatibility:**
- ✅ Pure TypeScript packages: Full compatibility
- ✅ Vite/Vitest: Full compatibility
- ✅ Hono, Zod, loro-crdt: Full compatibility
- ❌ LevelDB (`classic-level`): Unstable with Bun (segfaults, native binding issues)

### The Blocker

`apps/server/` uses LevelDB for Loro CRDT persistence via `@loro-extended/adapter-leveldb`. This package:
- Uses native C++ bindings via node-gyp
- Has documented crashes with Bun (issues #11010, #13307)
- Bun's native module compatibility is ~34% (improving to 90% in Bun 2.0, late 2026)

### Alternatives Evaluated

1. **Wait for Bun 2.0** (late 2026) - Long wait, no guarantees
2. **Build SQLite adapter** - 4-6 hours effort + testing + data migration
3. **Use LMDB** - Has async transaction issues with Bun
4. **Keep Node.js for server** - No migration cost

## Decision

**Adopt a hybrid approach:**

### Migrate to Bun:
- `packages/loro-schema/` - bunup build
- `packages/signaling/` - JIT pattern + bunup build
- `apps/hook/` - Full Bun runtime (4x faster startup matters for CLI)
- `apps/web/` - Bun for Vite dev/build (29% faster development)

### Keep Node.js:
- `apps/server/` - Not migrating due to LevelDB dependency
- Cloudflare Workers apps - Architectural constraint (V8 runtime)

### Tooling:
- **Package manager:** pnpm (Bun's PM doesn't support `pnpm-workspace.yaml`)
- **Runtime:** Bun where possible, Node.js where necessary
- **Build:** bunup for packages, native Bun for execution

## Consequences

### Positive

1. **Faster development experience**
   - Hook executes 4x faster on every Claude Code event
   - Web dev server starts 29% faster
   - Package builds 14-23x faster

2. **Reduced dependencies**
   - Removed undici (Bun has native fetch)
   - Removed tsdown from 2 packages

3. **JIT pattern for packages**
   - Changes in `packages/` immediately visible in dev
   - No rebuild step during development
   - publishConfig ensures production still uses dist

4. **Interoperability proven**
   - Bun-built packages work with Node.js consumers
   - pnpm + Bun work together seamlessly

### Negative

1. **Mixed runtime environment**
   - Some components on Bun, some on Node.js
   - Different debugging experiences
   - Team needs to know which runtime for each component

2. **Server can't use Bun**
   - Misses out on HTTP/WebSocket performance gains
   - Stays on Node.js indefinitely (or until Bun 2.0)

3. **Additional tooling**
   - Requires Bun installation alongside Node.js
   - CI/CD needs to support both runtimes

### Mitigations

- Document clearly which components use which runtime (this ADR + README)
- Use `engines` field in package.json to enforce correct runtime
- Keep the hybrid simple - don't over-complicate

## Alternatives Considered

### 1. Full Bun Migration (Migrate Server to SQLite)

**Rejected because:**
- Building custom SQLite adapter (~4-6 hours)
- Data migration effort and risk
- Performance gain would be negligible for our low-volume use case (~10-100 ops/sec)
- LevelDB works fine on Node.js, no problems to solve

### 2. No Bun Migration (Stay on Node.js)

**Rejected because:**
- Leaves significant performance gains on the table
- Hook startup (4x faster) directly impacts user experience
- No technical blockers for packages/hook/web

### 3. Wait for Bun 2.0

**Rejected because:**
- Late 2026 timeline too far out
- Even then, LevelDB compatibility not guaranteed
- Can get most benefits now with partial migration

## References

- [Bun Migration Analysis WHIP](../whips/bun-migration-analysis.md) - Full research
- [Bun LevelDB Issue #11010](https://github.com/oven-sh/bun/issues/11010) - Segfault reports
- [Bun SQLite Performance Controversy](https://github.com/oven-sh/bun/issues/4776)
- [LevelDB vs SQLite Comparison](https://db-engines.com/en/system/LevelDB%3BSQLite)
- [loro-extended adapters](https://github.com/SchoolAI/loro-extended/tree/main/adapters)

## Revisit Criteria

Reconsider server migration if:
1. Bun 2.0 ships with 90%+ native module compatibility and classic-level works reliably
2. loro-extended ships an official SQLite adapter
3. We need Bun's performance gains for the server (high load scenario)
4. LevelDB becomes problematic on Node.js

As of 2026-02-02, none of these conditions are met.

---

*Created: 2026-02-02*
