# Peer Discovery Approaches - Spike Comparison

## Overview

Three spikes were created to test different approaches for browser discovery of multiple MCP WebSocket servers on localhost.

## Approaches Compared

| Approach | Directory | Complexity | Performance | Production Ready |
|----------|-----------|------------|-------------|------------------|
| **Vite Plugin** | `vite-registry-plugin/` | Low | Fast | ⭐⭐⭐⭐ |
| **Port Range Scan** | `port-range-scan/` | Low | Medium | ⭐⭐⭐ |
| **Registry Server** | `registry-server/` | Medium | Fast | ⭐⭐⭐⭐⭐ |

---

## 1. Vite Registry Plugin

**Location:** `spikes/vite-registry-plugin/`

### How It Works
- Vite plugin serves `~/.peer-plan/servers.json` at `/api/registry`
- WS servers register on dynamic ports
- Browser fetches registry from Vite dev server

### Pros
- ✅ No CORS issues (same origin)
- ✅ Simple integration into existing Vite setup
- ✅ Auto-refresh via polling (5s)
- ✅ Works in development mode

### Cons
- ❌ Requires Vite dev server running
- ❌ Doesn't work with static builds (unless adapted)
- ❌ Couples discovery to frontend build tool

### Best For
- Development only
- When you're already using Vite
- Quick prototyping

---

## 2. Port Range Scanning

**Location:** `spikes/port-range-scan/`

### How It Works
- Browser probes ports 1234-1244 with 500ms timeout
- Connects to all responsive ports
- No registry file needed

### Pros
- ✅ Zero dependencies (no registry file/server)
- ✅ Self-contained (browser does everything)
- ✅ Works with static builds
- ✅ Fast parallel scanning (~500ms)

### Cons
- ❌ Port range must be known
- ❌ Slower than registry lookup
- ❌ Creates temporary connections (slight overhead)
- ❌ Limited to specific port range

### Best For
- Fallback mechanism
- When registry is unavailable
- Debugging/discovery tools

---

## 3. Registry Server (HTTP)

**Location:** `spikes/registry-server/`

### How It Works
- Dedicated HTTP server on port 3001
- WS servers write to `~/.peer-plan/servers.json`
- Browser fetches from `http://localhost:3001/registry`

### Pros
- ✅ Fast discovery (< 100ms)
- ✅ Works with any frontend (static, Vite, etc.)
- ✅ Centralized registry
- ✅ CORS headers handled

### Cons
- ❌ Requires separate registry server process
- ❌ Another port to manage (3001)
- ❌ Needs to handle registry server lifecycle

### Best For
- Production-like architecture
- When you need centralized discovery
- Works with static builds

---

## Performance Comparison

| Metric | Vite Plugin | Port Scan | Registry Server |
|--------|-------------|-----------|-----------------|
| **Discovery Time** | ~50ms | ~500ms | ~50ms |
| **Additional Processes** | 0 | 0 | 1 (registry) |
| **Network Requests** | 1 HTTP | 11 WS probes | 1 HTTP |
| **Registry Updates** | 5s poll | N/A | 5s poll |
| **Failover** | No | Automatic | No |

---

## Architecture Comparison

### Vite Plugin
```
~/.peer-plan/servers.json
         ↓
[Vite Plugin] /api/registry ← [Browser]
         ↓
    [WS Servers]
```

### Port Range Scan
```
[Browser] → Try ws://localhost:1234
[Browser] → Try ws://localhost:1235
[Browser] → Try ws://localhost:1236
    ...
[Browser] → Connect to responsive ports
```

### Registry Server
```
~/.peer-plan/servers.json
         ↓
[Registry Server :3001] /registry ← [Browser]
         ↓
    [WS Servers]
```

---

## Recommendation

### For peer-plan

**Use Registry Server approach** for these reasons:

1. **Decoupled from frontend** - Works with static builds
2. **Fast discovery** - Single HTTP request
3. **Centralized** - One source of truth
4. **Scalable** - Can add health checks, metadata, etc.
5. **Production-ready** - Minimal changes needed

### Implementation Plan

1. **MCP Server** writes to registry on startup
2. **Registry Server** runs on port 3001 (auto-start if not running)
3. **Browser** fetches registry on load
4. **Yjs** connects to all discovered servers

### Fallback Strategy

Use **port range scanning** as fallback if registry server is down:

```typescript
async function discoverServers() {
  try {
    // Try registry first
    return await fetchRegistry('http://localhost:3001/registry');
  } catch {
    // Fall back to port scanning
    return await scanPortRange(1234, 1244);
  }
}
```

---

## Quick Comparison Table

| Feature | Vite Plugin | Port Scan | Registry Server |
|---------|-------------|-----------|-----------------|
| Dev-only | ❌ Yes | ✅ No | ✅ No |
| Additional process | ✅ No | ✅ No | ❌ Yes (registry) |
| Discovery speed | ⚡ Fast | 🐌 Slow | ⚡ Fast |
| Static build support | ❌ No* | ✅ Yes | ✅ Yes |
| CORS issues | ✅ None | ✅ None | ⚠️ Need headers |
| Failover | ❌ No | ✅ Auto | ❌ No |
| Production ready | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

\* Could be adapted with build-time registry generation

---

## Next Steps

1. Choose approach (recommend Registry Server)
2. Integrate into `packages/server/` and `packages/web/`
3. Add health checks and stale entry cleanup
4. Add fallback to port scanning
5. Document in `docs/architecture.md`
6. Write tests for discovery mechanism

---

## Testing All Spikes

Each spike has its own README with testing instructions:

```bash
# Test Vite Plugin
cd spikes/vite-registry-plugin
npm install && npm run dev
# (In other terminals: npm run server)

# Test Port Scanning
cd spikes/port-range-scan
npm install && open index.html
# (In other terminals: npm run server)

# Test Registry Server
cd spikes/registry-server
pnpm install && ./start-all.sh
# Opens browser automatically
```

---

**Created:** 2026-01-03
**Decision:** Pending user review
