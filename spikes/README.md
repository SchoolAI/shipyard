# Spikes (Research & Proof of Concepts)

This directory contains research, experiments, and alternative approaches explored during peer-plan development.

## Purpose

Spikes are **not production code**. They are:
- Research documentation and decision rationale
- Proof-of-concept implementations
- Backup deployment options (tested and ready if needed)
- Learning resources for understanding trade-offs

For production code and current implementation, see `/apps/` and `/docs/`.

---

## Key Spikes

### Signaling Server Deployment

| Spike | Status | Notes |
|-------|--------|-------|
| `cloudflare-signaling/` | ✅ **In production** | Moved to `apps/signaling/cloudflare/` |
| `deno-signaling/` | Ready backup | Minimal Node.js port, generous free tier |
| `flyio-signaling/` | Ready backup | Deploy as-is with Cloudflare proxy |
| `public-signaling-test/` | Confirmed issue | All public servers are down |
| `SIGNALING-COMPARISON.md` | Decision record | Platform comparison and rationale |

**Summary:** Cloudflare Workers chosen for zero idle cost (WebSocket Hibernation), built-in protection, and company already uses Cloudflare.

### CRDT Library Evaluation

| Spike | Decision | Notes |
|-------|----------|-------|
| `loro-extended-repo/` | Not chosen | Evaluated Loro vs Yjs (see ADR-0001) |
| `COMPARISON.md` | Decision record | Chose Yjs for maturity and ecosystem |

**Summary:** Yjs chosen over Loro for production readiness and BlockNote integration.

### Other Research

| Spike | Purpose |
|-------|---------|
| `port-range-scan/` | MCP server discovery via port scanning |
| `registry-server/` | Registry-based MCP server discovery |
| `vite-registry-plugin/` | Vite plugin for registry integration |
| `plannotator/` | Third-party annotation tool evaluation |

---

## Using Spikes

### As Backup Options

If production deployment has issues, backup spikes are ready:

```bash
# Option 1: Deno Deploy
cd spikes/deno-signaling
deno deploy main.ts

# Option 2: Fly.io
cd spikes/flyio-signaling
fly launch && fly deploy
```

See individual spike READMEs for full deployment guides.

### As Research Reference

When making similar decisions:
1. Check if a spike exists for that domain
2. Review the decision rationale
3. Use spike code as starting point

---

## Spike Status Legend

- ✅ **In production** - Spike graduated to `apps/` or `packages/`
- 🔄 **Active research** - Ongoing investigation
- 📦 **Ready backup** - Tested alternative, ready if needed
- 🗄️ **Historical** - Decision record, not for current use

---

*Keep spikes for posterity - they document why we made the choices we did.*
