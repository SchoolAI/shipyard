# ADR 0006: WebRTC P2P with TURN Fallback for Sync Infrastructure

## Status

**Accepted** (2026-01-14)

## Context

Shipyard needs remote browser sync infrastructure to enable peer-to-peer collaboration without requiring localhost connections. Two approaches were evaluated:

1. **WebRTC P2P + TURN fallback** - Direct peer connections with relay fallback
2. **Cloudflare Durable Objects relay** - Centralized relay through Cloudflare infrastructure

### Cost Analysis

At 1 million users with typical usage (4 sessions/month, 50 messages/session):

| Approach | Monthly Cost | Cost Driver |
|----------|-------------|-------------|
| **WebRTC P2P + TURN** | **$35-40** | 15% TURN relay, 85% free P2P |
| Durable Objects Relay | $680 (or $111 with hibernation) | All traffic through relay |

**WebRTC is 17x more cost-effective at scale.**

### Assumptions

- Y.Doc update size: ~10KB (typical CRDT sync payload)
- WebRTC P2P success rate: 85% (STUN only, industry standard)
- TURN relay rate: 15% (symmetric NAT + strict firewalls)

### Industry Benchmarks

No company provides unlimited free sync at scale:
- **Figma**: VC-funded, freemium model
- **Excalidraw**: Paid tier subsidizes free
- **Liveblocks**: Usage-based ($5K-10K/year enterprise)
- **tldraw**: Self-hosted only

## Decision

**Implement WebRTC P2P with TURN fallback** for remote browser sync.

**Architecture:**
```
MCP Server ──────WebRTC P2P (85% free)──────► Remote Browsers
      ↓                                             ↓
Signaling Server (discovery only, minimal cost)
      ↓
TURN Server (15% of traffic, fallback only)
```

**Infrastructure:**
- Signaling: Cloudflare Workers (~$5-10/month)
- TURN: Cloudflare Calls ($0.05/GB, ~$30/month at 1M users)

## Consequences

### Positive

- **Cost efficiency**: 17x cheaper than centralized relay at scale
- **Proven at scale**: Figma, Excalidraw use this pattern
- **Graceful degradation**: Works for 85% without TURN relay
- **Low maintenance**: Leverage existing signaling server
- **Sustainable**: <$10/month for first 10K users

### Negative

- **TURN costs scale with failed P2P**: 15% relay rate could vary
- **Complexity**: Multiple infrastructure components (signaling + TURN)
- **NAT traversal**: Not guaranteed for 100% of connections

### Mitigations

- Monitor TURN usage and P2P success rates
- Add freemium tier if scaling beyond 100K users
- Provide self-hosted option for cost-conscious users

## Alternative Considered

**Cloudflare Durable Objects Relay** - Centralized relay using Durable Objects with WebSocket connections.

**Why rejected:**
- 3x more expensive even with WebSocket hibernation ($111 vs $35-40)
- 25x more expensive without hibernation ($1,185)
- All traffic goes through relay (no cost savings from direct P2P)
- Duration charges dominate at scale (GB-seconds pricing)

## References

- Original analysis: docs/cost-analysis.md (archived)
- [Cloudflare Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cloudflare Calls TURN Pricing](https://developers.cloudflare.com/realtime/turn/)
- [How Figma's Multiplayer Works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

## Revisit Criteria

Reconsider if:
- TURN relay rate exceeds 25% (NAT traversal worsens)
- User base exceeds 1M and costs become unsustainable
- Cloudflare pricing model changes significantly
- WebRTC compatibility issues affect >5% of users

---

*Created: 2026-01-14*
*Formalized as ADR: 2026-01-31*
