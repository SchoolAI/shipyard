# ADR 0005: Rebrand from Peer Plan to Shipyard

## Status

**Accepted** (2026-01-19)

## Context

The project was originally named "Peer Plan" when it started as a simple planning tool for AI agents. As the product evolved into a comprehensive agent verification and collaboration workspace, the name no longer captured its full scope.

### Problem Statement

"Peer Plan" had several limitations:
- **Too narrow**: Implied just a planning tool, missing the verification, artifact delivery, and collaboration aspects
- **Didn't convey the workspace nature**: The product had grown to include real-time sync, P2P collaboration, artifact storage, and review workflows
- **Weak brand identity**: Didn't have the memorable quality needed for developer adoption

### Research & Brainstorming

An extensive naming exploration was conducted, evaluating candidates on:
1. **Memorability** - Does it roll off the tongue?
2. **Meaning** - Does it convey the product's purpose?
3. **Namespace** - Is the name available (domains, GitHub, SEO)?
4. **Logo compatibility** - Does it work with the Penrose triangle brand?

## Decision

**Rename from "Peer Plan" to "Shipyard"**

The name was chosen because:

1. **Play on words with "shipping"** - Captures the dev culture concept of "shipping features/products/work"
2. **Workspace metaphor** - "Where work is built" - conveys the collaborative construction aspect
3. **Clean namespace** - Less collision risk than alternatives
4. **Scalability** - Works as the product expands into full agent orchestration

### Implementation Scope

The rebrand touched 205+ files across the entire codebase:
- Package scope: `@peer-plan/*` → `@shipyard/*`
- All documentation and UI text
- Storage keys: `peer-plan-*` → `shipyard-*`
- Environment variables: `PEER_PLAN_*` → `SHIPYARD_*`
- MCP server name and configuration
- GitHub Actions workflows
- Skill folder: `peer-plan-skill` → `shipyard-skill`
- Hook binary: `peer-plan-hook` → `shipyard-hook`

## Consequences

### Positive

- **Stronger brand identity** - More memorable and meaningful name
- **Better alignment** - Name matches the product's evolved scope
- **Dev culture resonance** - "Shipping" language speaks to developers
- **Future-proof** - Scales with product growth

### Negative

- **One-time migration cost** - Significant codebase changes
- **Breaking changes** - Required reinstall and config updates
- **No migration path** - Existing local storage data doesn't migrate (acceptable given early stage)

### Mitigations

- Comprehensive find-and-replace with verification
- Clear documentation of breaking changes in commit message
- No backwards compatibility needed (early stage, no external users)

## Alternatives Considered

### Trust Mesh
- **Pros**: Captured the interconnected verification nature
- **Cons**: Hard to pronounce ("Trust trust mesh"), two words

### Harbor
- **Pros**: Strong metaphor of "place where agents gather"
- **Cons**: Namespace collision with harbor.ai.org and harbor CNCF project

### Marina
- **Pros**: Lighter feeling than Harbor
- **Cons**: Typically associated with pleasure boats, not "work" vessels

### Lattice
- **Pros**: Conveyed interconnected structure
- **Cons**: Would require logo redesign, less memorable

### Proof Loop
- **Pros**: Captured verification aspect
- **Cons**: Conflict with proofloops.dev, logo is a triangle not a loop

### Foundry
- **Pros**: Workspace/building metaphor
- **Cons**: Less unique, more industrial than collaborative

## Logo Context

The Penrose triangle (impossible triangle) logo represents the "impossible triangle" of AI development:
- **Quality**
- **Speed**
- **Autonomy/Low Effort**

Traditionally you sacrifice one. Shipyard enables all three through collaborative verification loops.

The teal color palette was chosen for:
- Professional developer aesthetic
- Good accessibility contrast
- Distinctive in the AI tools space

## References

- Rebrand commit: `0ea65ed` (Jan 19, 2026)
- Original naming exploration: Claude Code session `f0b4a0bf-85dd-4620-9825-01aca914f74b`
- Logo design exploration: Claude Code session with Gemini image generation

## Revisit Criteria

This decision should be revisited if:
- Significant trademark/namespace conflicts emerge
- The product pivots to a fundamentally different purpose
- User research indicates confusion with the name

---

*Created: 2026-01-20*
