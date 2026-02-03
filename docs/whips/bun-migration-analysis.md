# Bun Migration Analysis for Shipyard

**Created:** 2026-02-01
**Updated:** 2026-02-02
**Status:** Complete (Partial Migration)
**Decision:** Hybrid - Bun for packages/hook/web, Node.js for server

---

## Executive Summary

This document analyzes the feasibility of migrating Shipyard from Node.js to Bun during the ongoing Loro migration. The analysis covers compatibility with all current and planned apps/packages, identifies blockers, and provides recommendations.

**Bottom Line:** Partial Bun migration completed. Bun is viable for packages, hook, and web development with significant performance gains. Server stays on Node.js due to LevelDB dependency - migration not worth the effort.

### Final Decision

**Migrated to Bun:**
- ✅ `packages/loro-schema/` - bunup build (949ms)
- ✅ `packages/signaling/` - JIT pattern + bunup (635ms, 14% faster)
- ✅ `apps/hook/` - Bun runtime (50ms startup, 4x faster)
- ✅ `apps/web/` - Bun for Vite dev server (141ms, 29% faster)

**Staying on Node.js:**
- ❌ `apps/server/` - LevelDB native bindings, not worth migrating to SQLite

**Rationale:** The server migration would require building a custom SQLite adapter for loro-extended and migrating storage layers. The performance gain would be negligible for our low-volume use case, and the risk/effort isn't justified.

---

## Final Recommendation: What Should Use Bun

### Use Bun (Runtime + Build)

| Component | Build | Runtime | Why |
|-----------|-------|---------|-----|
| `packages/loro-schema/` | **Bun** | N/A | Pure TS, no native deps |
| `packages/signaling/` | **Bun** | N/A | Pure TS, Zod only |
| `apps/hook/` | **Bun** | **Bun** | 4x faster CLI startup, no blockers |

### Use Bun (Build Only)

| Component | Build | Runtime | Why |
|-----------|-------|---------|-----|
| `apps/web/` | **Bun** | Browser | Faster Vite dev server; runtime is browser, not Bun |
| `apps/signaling/` | **Bun** | CF Workers (V8) | CF Workers use V8; Bun for faster installs |
| `apps/og-proxy-worker/` | **Bun** | CF Workers (V8) | Same as signaling |

### Keep Node.js (Final Decision)

| Component | Build | Runtime | Why |
|-----------|-------|---------|-----|
| `apps/server/` | Node.js | **Node.js** | LevelDB - not migrating (see below) |

### Key Clarifications

1. **pnpm + Bun work together** - Use pnpm for workspace management, Bun as runtime
2. **Packages are interoperable** - Bun-built packages can be imported by Node.js apps
3. **Browser apps** - `apps/web/` runs in the browser; Bun only helps during development
4. **CF Workers** - Architectural constraint; CF uses V8, cannot use Bun runtime

---

## Why Server Stays on Node.js

### LevelDB Compatibility Analysis

**loro-extended adapters available:**
- ✅ LevelDB - Works with Node.js
- ✅ Postgres - Template for SQL-based storage
- ✅ IndexedDB - Browser only
- ❌ SQLite - Does not exist

**Bun + LevelDB status:**
- Documented segfaults and crashes (GitHub issues #11010, #13307)
- Native module compatibility ~34% (improving to 90% in Bun 2.0, late 2026)
- Unreliable, especially on Windows

### SQLite Alternative Evaluation

**Would need to:**
1. Build custom SQLiteStorageAdapter (~4-6 hours)
2. Migrate data from LevelDB to SQLite
3. Test loro-extended integration thoroughly

**Performance trade-off:**
- LevelDB: Better for write-heavy workloads (LSM tree)
- SQLite: Better for read-heavy workloads (B-tree)
- **Our use case:** Low volume (~10-100 ops/sec), difference is negligible
- **Bun's SQLite claims:** [3-6x faster than better-sqlite3](https://bun.com/docs/runtime/sqlite), but [questioned as misleading](https://github.com/oven-sh/bun/issues/4776) (measures serialization, not actual DB performance)

### Final Decision

**Not worth migrating.** The effort to build and test a SQLite adapter doesn't justify the marginal benefit. The server works fine on Node.js, and Bun's performance gains would be minimal for our low-volume storage operations.

**If we ever need to migrate:** Wait for Bun 2.0 (late 2026) with 90% native module compatibility, or loro-extended to ship an official SQLite adapter.

---

## Actual Migration Results

### What Was Migrated

| Component | Status | Measured Improvement |
|-----------|--------|---------------------|
| `packages/loro-schema/` | ✅ Migrated to bunup | 949ms builds |
| `packages/signaling/` | ✅ Migrated to JIT + bunup | 635ms (14% faster) |
| `apps/hook/` | ✅ Migrated to Bun runtime | 50ms startup (4x faster), 31ms builds (23x faster) |
| `apps/web/` | ✅ Using Bun for Vite | 141ms dev start (29% faster) |

### What Stayed on Node.js

| Component | Reason |
|-----------|--------|
| `apps/server/` | LevelDB native bindings, migration effort not justified |
| `apps/signaling/` | Cloudflare Workers (V8 runtime, architectural constraint) |
| `apps/og-proxy-worker/` | Cloudflare Workers (V8 runtime, architectural constraint) |

---

## Current Inventory (Pre-Migration)

### Apps

| App | Runtime | Status | Key Dependencies |
|-----|---------|--------|------------------|
| `apps/server-legacy/` | Node.js | **Deprecated** | Yjs, y-websocket, LevelDB, tRPC |
| `apps/daemon-legacy/` | Node.js | **Deprecated** | Express, child_process |
| `apps/server/` | Node.js | **Active (new)** | Loro-extended, Hono, ws, LevelDB |
| `apps/hook/` | Node.js | **Active** | Yjs, y-websocket, tRPC, pino |
| `apps/signaling/` | CF Workers | **Active** | Hono, Zod, Durable Objects |
| `apps/og-proxy-worker/` | CF Workers | **Active** | lz-string, workers-og |
| `apps/web/` | Browser | **Active** | Vite, React 19, BlockNote, Yjs |

### Packages

| Package | Runtime Target | Status | Key Dependencies |
|---------|---------------|--------|------------------|
| `packages/schema-legacy/` | Universal | **Deprecated** | BlockNote, Yjs, Zod |
| `packages/shared-legacy/` | Universal | **Deprecated** | None |
| `packages/loro-schema/` | Universal | **Active (new)** | loro-crdt, Zod, lz-string |
| `packages/signaling/` | Universal | **Active** | Zod |

---

## Post-Migration Inventory

After the Loro migration completes (per existing WHIPs), the active components will be:

### Apps (Post-Migration)

| App | Current Runtime | Bun Viable? | Notes |
|-----|-----------------|-------------|-------|
| `apps/server/` (unified MCP + daemon) | Node.js | **Partial** | LevelDB native bindings problematic |
| `apps/hook/` (migrated to Loro) | Node.js | **Yes** | Needs Loro client, child_process |
| `apps/signaling/` | CF Workers | **Build only** | CF Workers runtime is V8, not Bun |
| `apps/og-proxy-worker/` | CF Workers | **Build only** | Same as signaling |
| `apps/web/` | Browser | **Dev only** | Vite + Bun for dev, outputs browser code |

### Packages (Post-Migration)

| Package | Bun Viable? | Notes |
|---------|-------------|-------|
| `packages/loro-schema/` | **Yes** | Pure TypeScript, Zod, no native deps |
| `packages/signaling/` | **Yes** | Pure TypeScript, Zod only |
| `packages/shared/` (if created) | **Yes** | Likely pure TypeScript |

---

## Bun Compatibility Matrix

### Core Node.js APIs

| API | Bun Support | Notes |
|-----|-------------|-------|
| `child_process.spawn` | **Full** | 60% faster than Node.js |
| `child_process.fork` | **Partial** | IPC works with `"json"` serialization only |
| `fs/promises` | **Full** | Native support |
| `crypto` | **Full** | Web Crypto API + Node.js compat |
| `net` | **Full** | TCP/TLS support |
| `http/https` | **Full** | Native HTTP server |
| `process` | **Full** | Some properties missing |

### Key Dependencies

| Dependency | Bun Support | Impact | Workaround |
|------------|-------------|--------|------------|
| **Hono** | **Excellent** | None | 7x faster on Bun |
| **Zod** | **Full** | None | Pure JS |
| **loro-crdt** | **Yes** | None | WASM-based, universal |
| **loro-extended** | **Yes** | None | Has Bun examples |
| **Vitest** | **Partial** | Some features | Use `bun run vitest` or migrate to `bun:test` |
| **tsup** | **Full** | None | esbuild-based |
| **tsdown** | **Experimental** | Build-time only | May need Node.js fallback |
| **pino** | **Full** | None | Pure JS |
| **classic-level** (LevelDB) | **Problematic** | **Blocker** | Native C++ bindings |
| **ws** | **Partial** | `upgrade` event missing | Use Bun native WebSocket |
| **Vite** | **Full** | None | Use `bunx --bun vite` |
| **express** | **Full** | None | But prefer Hono |
| **@octokit/rest** | **Full** | None | Pure JS/fetch-based |
| **nanoid** | **Full** | None | Pure JS |
| **lz-string** | **Full** | None | Pure JS |

### Runtime Environments

| Environment | Bun Applicability | Notes |
|-------------|-------------------|-------|
| **Node.js server** | **Replace** | Full Bun runtime |
| **Cloudflare Workers** | **Build only** | CF uses V8, not Bun runtime |
| **Browser** | **Dev/build only** | Output still targets browsers |
| **CLI tools** | **Replace** | Faster startup time |

---

## Detailed Analysis by Component

### 1. `apps/server/` (MCP Server + Daemon)

**Current Stack:** Node.js 22, Hono, ws, LevelDB (classic-level), loro-extended

**Bun Compatibility Issues:**

1. **LevelDB (`classic-level`)** - **BLOCKER**
   - Uses node-gyp native C++ bindings
   - Bun's native module compatibility is ~34% as of early 2026
   - Expected to reach 90% by late 2026 (Bun 2.0)

   **Workarounds:**
   - Use `memory-level` for testing (in-memory, no native deps)
   - Use `lmdb` (Lightning Memory-Mapped Database) - has Bun support
   - Use SQLite via Bun's native `bun:sqlite` (bundled, fast)
   - Run LevelDB operations in a Node.js subprocess

2. **WebSocket (`ws` package)** - **Partial**
   - Bun overrides `ws` with its native implementation
   - Missing: `upgrade` event, some edge cases
   - Bun's native WebSocket is 7x faster

   **Workarounds:**
   - Use Bun's native WebSocket API directly
   - Refactor to use Hono's WebSocket helpers

3. **child_process** - **Compatible**
   - Spawning Claude Code works
   - IPC needs `"json"` serialization (not handles)

**Recommendation:** **Hybrid approach** - Use Bun for HTTP/WebSocket, keep Node.js for LevelDB, OR migrate to SQLite (`bun:sqlite`).

### 2. `apps/hook/` (Claude Code Hook)

**Current Stack:** Node.js, Yjs, y-websocket, tRPC, pino

**Post-Migration Stack:** Node.js, Loro client, pino, Zod

**Bun Compatibility:** **Excellent**

- No native dependencies
- `child_process.spawn` works (for potential daemon communication)
- Faster CLI startup time (important for hooks)

**Recommendation:** **Migrate to Bun** - Will reduce hook execution latency significantly.

### 3. `apps/signaling/` (Cloudflare Workers)

**Current Stack:** Wrangler, Hono, Durable Objects

**Bun Compatibility:** **Build-time only**

- Cloudflare Workers run on V8, not Bun
- Bun cannot replace the Workers runtime
- CAN use Bun for:
  - Package management (`bun install`)
  - Local development (`wrangler dev` with Bun)
  - Building/bundling

**Recommendation:** **Use Bun for dev/build** - Keep Wrangler for deployment.

### 4. `apps/og-proxy-worker/` (Cloudflare Workers)

Same as signaling - Bun for dev/build only.

### 5. `apps/web/` (Browser App)

**Current Stack:** Vite 7, React 19, Tailwind v4, BlockNote

**Post-Migration Stack:** Vite 7, React 19, Tailwind v4, Tiptap + loro-prosemirror

**Bun Compatibility:** **Build/dev only - runtime is the browser**

The web app runs in the user's browser, not in Bun or Node.js:

```
Development:  Bun → runs Vite dev server → Browser executes code
Production:   Bun → runs Vite build → outputs JS bundle → Browser executes code
```

Bun helps during development:
- `bunx --bun vite dev` - Faster dev server startup
- `bunx --bun vite build` - Faster build
- Faster HMR (Hot Module Replacement)

But the production runtime is always the user's browser (Chrome, Safari, Firefox, etc.).

**Recommendation:** **Use Bun for build/dev** - Faster development experience.

### 6. `packages/loro-schema/`

**Current Stack:** tsdown, Zod, loro-crdt (WASM)

**Bun Compatibility:** **Full**

- Pure TypeScript
- WASM-based loro-crdt works in Bun
- No native dependencies

**Recommendation:** **Migrate to Bun** - Can use `bun build` or keep tsdown.

### 7. `packages/signaling/`

**Current Stack:** tsdown, Zod

**Bun Compatibility:** **Full**

- Pure TypeScript, no native deps

**Recommendation:** **Migrate to Bun** - Simple.

---

## Workspace & Tooling Compatibility

### Package Manager: pnpm + Bun Hybrid (Recommended)

**Use pnpm for package management, Bun for runtime execution.**

```bash
# pnpm manages dependencies and workspaces
pnpm install                          # Uses pnpm-workspace.yaml
pnpm --filter @shipyard/hook build    # Workspace filtering

# Bun executes the code
bun run apps/hook/dist/index.js       # Fast runtime
bunx --bun vite dev                   # Fast dev server
```

**Why this works:**
- pnpm creates `node_modules/` structure
- Bun reads from the same `node_modules/`
- Both understand `workspace:*` protocol
- Keep your existing `pnpm-workspace.yaml`

| Feature | pnpm | Bun Package Manager |
|---------|------|---------------------|
| Workspace support | **Mature** | Good |
| `workspace:*` protocol | **Yes** | Yes |
| `pnpm-workspace.yaml` | **Yes** | ❌ No |
| Filtering (`--filter`) | **Excellent** | Good |
| Strict dependency resolution | **Yes** | No |

**Recommendation:** Keep pnpm for workspace management. Bun's package manager doesn't support `pnpm-workspace.yaml`.

### Package Interoperability

**Bun-built packages work with Node.js apps:**

```
packages/loro-schema/     (built with Bun)
         ↓ outputs standard ES modules
         ↓
apps/server/              (runs on Node.js)
         ↓ imports normally
         ✅ Works - same JavaScript output
```

Both Bun and Node.js output standard JavaScript. The runtime only matters for execution, not for the output format. A package built with Bun can be imported by any JavaScript runtime.

### Build Tools

| Tool | Node.js | Bun | Notes |
|------|---------|-----|-------|
| **Turbo** | **Yes** | **Yes** | Works with both |
| **tsup** | **Yes** | **Yes** | esbuild-based |
| **tsdown** | **Yes** | **Experimental** | May have issues |
| **Vite** | **Yes** | **Yes** | Use `--bun` flag |
| **Biome** | **Yes** | **Yes** | Pure Rust, runtime-agnostic |

### Testing

| Approach | Notes |
|----------|-------|
| **Keep Vitest** | Use `bun run vitest`, most features work |
| **Migrate to bun:test** | Native, faster, but migration effort |
| **Hybrid** | Vitest for complex tests, bun:test for simple |

**Recommendation:** Start with `bun run vitest`, migrate to `bun:test` incrementally.

---

## Migration Strategy

### Option A: Full Bun Migration (Not Recommended)

**Pros:**
- Unified runtime
- Maximum performance

**Cons:**
- LevelDB blocker requires storage layer rewrite
- Risk of compatibility issues
- More migration effort during Loro migration

### Option B: Hybrid Migration (Recommended)

**Phase 1: Low-hanging fruit (during Loro migration)**
- ✅ Use `bun install` for faster installs
- ✅ Use `bunx --bun vite dev` for web development
- ✅ Migrate `apps/hook/` to Bun runtime
- ✅ Migrate pure TypeScript packages to Bun build

**Phase 2: Server migration (post-Loro migration)**
- Evaluate LevelDB alternatives (SQLite via `bun:sqlite`, or LMDB)
- Migrate `apps/server/` WebSocket layer to Bun native
- Keep Node.js fallback for any problematic native modules

**Phase 3: Full Bun (late 2026)**
- Wait for Bun 2.0 with 90% native module compatibility
- Re-evaluate LevelDB/classic-level support
- Complete migration

### Option C: Bun for Development Only (Conservative)

**Pros:**
- Faster development experience
- No production risk
- No migration of production code

**Cons:**
- Doesn't get Bun's runtime benefits
- Still running Node.js in production

---

## Specific Recommendations

### Immediate Actions (Week 1-2)

1. **Add Bun to CI/CD** for install step comparison
2. **Update `apps/web/` scripts** to use `bunx --bun vite`
3. **Test `apps/hook/`** with Bun runtime

### Short-term Actions (Loro Migration Period)

1. **Migrate hook to Bun** - Low risk, high reward (faster hook execution)
2. **Use Bun for package builds** where tsdown is experimental
3. **Keep pnpm** as primary package manager (more mature filtering)

### Medium-term Actions (Post-Loro Migration)

1. **Evaluate storage layer** - Consider `bun:sqlite` as LevelDB alternative
   - SQLite is ACID-compliant
   - Bun's SQLite is bundled and fast
   - Simpler than LevelDB for our use case

2. **Migrate server WebSocket** to Bun native API
3. **Benchmark full Bun server** vs Node.js

### Decision Points

| Decision | When | Criteria |
|----------|------|----------|
| Hook migration | Now | Test passes with Bun |
| Storage layer | Post-Loro | Performance + compatibility |
| Full server migration | Bun 2.0 | Native module compatibility >80% |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LevelDB incompatibility | **High** | **High** | Use SQLite or hybrid |
| ws package issues | **Medium** | **Medium** | Use Bun native WebSocket |
| Vitest edge cases | **Low** | **Low** | Keep Node.js for tests |
| Workspace filtering gaps | **Low** | **Medium** | Keep pnpm as fallback |
| loro-crdt WASM issues | **Low** | **High** | Test thoroughly first |

---

## Performance Expectations

Based on benchmarks:

| Metric | Node.js | Bun | Improvement |
|--------|---------|-----|-------------|
| HTTP requests/sec (Hono) | ~15,000 | ~50,000 | **3.3x** |
| WebSocket throughput | Baseline | 7x | **7x** |
| CLI startup time | ~200ms | ~50ms | **4x** |
| `npm install` equivalent | ~30s | ~5s | **6x** |
| Process spawn | Baseline | 60% faster | **1.6x** |

---

## Appendix A: Migration Checklist (Completed)

### `apps/hook/` → Bun ✅

- [x] Update shebang to `#!/usr/bin/env bun`
- [x] Remove undici, use Bun native fetch
- [x] Verify pino logging works
- [x] Update package.json engines to `bun: >=1.1.0`
- [x] Migrate to bunup build
- [x] Test with Claude Code hooks

### `apps/web/` → Bun (dev only) ✅

- [x] Update dev script: `bunx --bun vite dev`
- [x] Update build script: `bunx --bun vite build`
- [x] Update preview script: `bunx --bun vite preview`
- [x] Verify startup time improved (29% faster)

### `packages/loro-schema/` → Bun ✅

- [x] Migrate to bunup build
- [x] Verify loro-crdt WASM works
- [x] Simplify exports (removed non-existent subpaths)
- [x] Tests pass (33 tests)

### `packages/signaling/` → Bun ✅

- [x] Migrate to bunup build
- [x] Implement JIT pattern (publishConfig)
- [x] Verify imports work with tsx, Bun, Node.js
- [x] 14% faster builds

### `apps/server/` → Node.js (Not Migrating) ❌

**Decision:** Keep on Node.js with LevelDB.

**Reason:** Building a custom SQLite adapter and migrating storage is not justified for our low-volume use case. LevelDB works fine with Node.js, and the performance gain from Bun would be negligible.

---

## Appendix B: Cloudflare Workers Clarification

**Important:** Cloudflare Workers use their own V8-based runtime. Bun cannot replace this runtime.

**What Bun CAN do for CF Workers:**
- Package management (`bun install`)
- Local development (faster than npm)
- Build/bundle (but Wrangler handles deployment)

**What Bun CANNOT do:**
- Replace the CF Workers runtime
- Run Workers locally (that's miniflare/wrangler)

---

## Appendix C: LevelDB vs SQLite Performance Analysis

### Does loro-extended have a SQLite adapter?

**No.** Available storage adapters:
- `@loro-extended/adapter-leveldb` - Node.js only (native bindings)
- `@loro-extended/adapter-postgres` - Could serve as template for SQLite
- `@loro-extended/adapter-indexeddb` - Browser only

Building a SQLite adapter would require ~4-6 hours of work copying the Postgres adapter pattern.

### Performance Comparison

| Factor | LevelDB | SQLite (bun:sqlite) |
|--------|---------|---------------------|
| Write performance | **Better** (LSM tree, optimized for writes) | Good (B-tree) |
| Read performance | Good | **Better** (B-tree, optimized for reads) |
| CRDT use case | Theoretically better (CRDTs are write-heavy) | Slightly worse |
| **Our actual volume** | ~10-100 ops/sec (negligible difference) | ~10-100 ops/sec (negligible difference) |
| Bun compatibility | ❌ Unstable (segfaults) | ✅ Native support |

### Performance Impact for Shipyard

**Theoretical:** LevelDB ~10-20% faster on writes for high-throughput CRDT operations.

**Reality:** Our use case (task metadata, session tracking, Loro persistence) is LOW VOLUME. Both would perform identically.

**Bun's SQLite claims:** 3-6x faster than better-sqlite3, but this is [questioned as misleading](https://github.com/oven-sh/bun/issues/4776) - the benchmarks measure JavaScript serialization speed, not actual SQLite query performance.

### Migration Effort vs Benefit

| Effort | Benefit |
|--------|---------|
| Build SQLite adapter (4-6 hours) | Negligible performance change |
| Migrate data | Risk of data loss |
| Test thoroughly | Time investment |
| **Total cost:** ~8-12 hours | **Gain:** <5% performance, maybe |

**Verdict:** Not worth it. Keep LevelDB + Node.js.

---

## Related Work

**loro-extended exports fix:** Created [PR #6](https://github.com/SchoolAI/loro-extended/pull/6) to add missing `default` export condition to all packages, enabling tsx compatibility.

---

## Sources

- [Bun Node.js Compatibility](https://bun.com/docs/runtime/nodejs-compat)
- [Bun SQLite Documentation](https://bun.com/docs/runtime/sqlite)
- [Bun SQLite Performance](https://github.com/oven-sh/bun/issues/4776)
- [Bun WebSockets](https://bun.com/docs/runtime/http/websockets)
- [Bun + Vite](https://bun.com/docs/guides/ecosystem/vite)
- [Cloudflare Workers Build Image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Hono Benchmarks](https://hono.dev/docs/concepts/benchmarks)
- [classic-level GitHub](https://github.com/Level/classic-level)
- [loro-extended GitHub](https://github.com/SchoolAI/loro-extended)
- [LevelDB vs SQLite Comparison](https://db-engines.com/en/system/LevelDB%3BSQLite)
- [CRDT Optimizations](https://www.bartoszsypytkowski.com/crdt-optimizations/)

---

*Last updated: 2026-02-02*
