# Original Vision Documents

> **Do not use for implementation.** These capture initial thinking before research/spikes.
> For current architecture, see [../architecture.md](../architecture.md).
> For quick context, see [../BRIEF.md](../BRIEF.md).

## Contents

- [technical-brief.md](./technical-brief.md) — Original architecture vision
- [system-diagrams.md](./system-diagrams.md) — Original Mermaid diagrams

## What Changed

Through spikes and research, we refined several details:

| Original Assumption | Reality |
|---------------------|---------|
| `github.com/anthropics/loro-extended` | Actual repo: `github.com/SchoolAI/loro-extended` |
| All peers use WebRTC | MCP↔browser uses WebSocket (simpler) |
| GitHub stores plan data | GitHub only stores binary artifacts |
| URL references stored data | URL IS the data (compressed snapshot) |

The original docs are preserved for historical context and to understand the "why" behind decisions.
