<div align="center">
  <img src="apps/web/public/icon.svg" alt="Shipyard Logo" width="200" height="200">
  <h1>Shipyard</h1>
  <p><strong>P2P collaborative review for AI-generated implementation plans</strong></p>
</div>

---

The Penrose triangle logo represents the "impossible triangle" of AI development: quality, speed, and low effort. Traditionally you sacrifice one. Shipyard enables all three through collaborative verification loops.

## What is this?

When an AI agent generates an implementation plan, Shipyard enables:
- **Real-time collaborative review** between humans and agents
- **Agent verifiability** through artifacts (screenshots, test results, recordings)
- **Zero infrastructure** — GitHub Pages + local MCP server, no paid services

## Documentation

- **[docs/](./docs/)** — Architecture, milestones, systems inventory
- **[docs/original-vision/](./docs/original-vision/)** — Original design docs (historical)

## Status

**All core milestones complete!** 🎉 See [PROGRESS.md](./docs/milestones/PROGRESS.md) for implementation details.

> **Test:** Testing Shipyard end-to-end workflow with screenshot artifact and PR creation.

## Quick Start

See [SETUP.md](./docs/SETUP.md) for installation and development instructions.

## Claude Cowork Integration

Use Shipyard with Claude Cowork via the included skill:

```
shipyard-skill/
├── SKILL.md      # Instructions for Claude
├── README.md     # Setup guide
└── examples/     # Usage examples
```

See [shipyard-skill/README.md](./shipyard-skill/README.md) for installation.

## License

This project is licensed under the [FSL (Functional Source License)](./LICENSE.md).

- Free for all non-competing use
- Automatically becomes Apache 2.0 in 2 years

We chose this to ensure that all core improvements help grow this main repository.
