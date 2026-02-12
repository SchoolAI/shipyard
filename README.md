<div align="center">
  <h1>Shipyard</h1>
  <p><strong>Ship responsibly.</strong></p>
  <p>Agent management hub for human-agent collaboration.</p>

  <p>
    <a href="./LICENSE.md"><img src="https://img.shields.io/badge/license-FSL--1.1-blue" alt="License"></a>
  </p>
</div>

---

## What is Shipyard?

Shipyard is a collaboration workspace for mixed human-agent teams. Agents create tasks with proof (screenshots, videos, test results). Humans review in real-time. Feedback flows both ways.

## Current State

Shipyard is in active development. The codebase was recently cleaned to a minimal foundation:

| Component | Description |
|-----------|-------------|
| [**Session Server**](./apps/session-server) | Auth + WebRTC signaling (Cloudflare Workers + Durable Objects) |
| [**OG Proxy**](./apps/og-proxy-worker) | Open Graph meta tags for social link previews |
| [**Loro Schema**](./packages/loro-schema) | CRDT Shape definitions, typed documents, helpers |
| [**Session**](./packages/session) | Session/auth shared types and client |

**Tech stack:** Loro CRDT (loro-extended), TipTap editor, HeroUI v3, Tailwind v4, Cloudflare Workers

## Documentation

| Doc | Description |
|-----|-------------|
| **[Development](./docs/development.md)** | Local setup, running services |
| **[Architecture](./docs/architecture.md)** | Data model, sync topology, tech choices |
| **[Engineering Standards](./docs/engineering-standards.md)** | Code quality, testing philosophy |

## License

[FSL-1.1-ALv2](./LICENSE.md) (Functional Source License)

- **Free** for all non-competing use
- **Converts to Apache 2.0** automatically in 2 years
