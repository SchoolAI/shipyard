# Bun Migration Analysis for Shipyard

**Created:** 2026-02-01
**Status:** Research Complete, Decision Pending
**Author:** Claude (research agent)

---

## Executive Summary

This document analyzes the feasibility of migrating Shipyard from Node.js to Bun during the ongoing Loro migration. The analysis covers compatibility with all current and planned apps/packages, identifies blockers, and provides recommendations.

**Bottom Line:** Bun is viable for most components with significant performance benefits, but has specific compatibility challenges with LevelDB native bindings and the `ws` package. A hybrid approach is recommended.

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

**Bun Compatibility:** **Development only**

- Use `bunx --bun vite dev` for faster dev server
- Use `bun install` for faster dependency installation
- Build output still targets browsers (no runtime change)

**Recommendation:** **Use Bun for development** - Faster HMR, faster installs.

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

### Package Manager

| Feature | pnpm | Bun |
|---------|------|-----|
| Workspace support | **Mature** | **Good** |
| `workspace:*` protocol | **Yes** | **Yes** |
| Filtering (`--filter`) | **Excellent** | **Good** |
| Strict dependency resolution | **Yes** | **No** |
| Disk space savings | **Excellent** | **Good** |
| Install speed | Fast | **Fastest** |

**Recommendation:** Can migrate to Bun package manager, but pnpm is more mature for complex monorepos.

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

## Appendix A: Component Migration Checklist

### `apps/hook/` → Bun

- [ ] Update shebang to `#!/usr/bin/env bun`
- [ ] Test child_process.spawn for daemon communication
- [ ] Verify pino logging works
- [ ] Update package.json engines
- [ ] Test with Claude Code hooks

### `apps/web/` → Bun (dev only)

- [ ] Update dev script: `bunx --bun vite dev`
- [ ] Add `base: './'` to vite.config.ts if not present
- [ ] Test HMR works correctly
- [ ] Verify build output unchanged

### `packages/loro-schema/` → Bun

- [ ] Test build with Bun
- [ ] Verify loro-crdt WASM works
- [ ] Update build script if needed

### `apps/server/` → Bun (deferred)

- [ ] Evaluate SQLite vs LevelDB
- [ ] Migrate WebSocket to Bun native
- [ ] Test loro-extended adapters
- [ ] Benchmark against Node.js

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

## Sources

- [Bun WebSockets Documentation](https://bun.com/docs/runtime/http/websockets)
- [Bun child_process.spawn](https://bun.com/reference/node/child_process/spawn)
- [Bun Workspaces Guide](https://bun.com/docs/guides/install/workspaces)
- [Cloudflare Workers Build Image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Hono Benchmarks](https://hono.dev/docs/concepts/benchmarks)
- [Hono + Bun Getting Started](https://hono.dev/docs/getting-started/bun)
- [classic-level GitHub](https://github.com/Level/classic-level)
- [loro-extended GitHub](https://github.com/SchoolAI/loro-extended)
- [Build Frontend with Vite and Bun](https://bun.com/docs/guides/ecosystem/vite)
- [tsdown Migration Guide](https://tsdown.dev/guide/migrate-from-tsup)
- [pnpm vs npm vs yarn vs Bun 2026](https://dev.to/pockit_tools/pnpm-vs-npm-vs-yarn-vs-bun-the-2026-package-manager-showdown-51dc)
- [Bun Package Manager Reality Check 2026](https://vocal.media/01/bun-package-manager-reality-check-2026)

---

*Last updated: 2026-02-01*
