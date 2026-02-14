# WHIP: Shipyard Logo & Brand Exploration

## Status: Ready for Review

## Problem

The current logo is an AI-generated container ship illustration. While it communicates "shipping," it:
- Is 852KB as SVG (raster data embedded in SVG wrapper)
- Feels like generic stock clipart
- Doesn't scale well to favicon sizes (too much detail)
- Can't be reproduced as ASCII art
- Doesn't capture what makes Shipyard unique (human-agent collaboration, verification, distributed sync)

## Design Criteria

1. **Flat/geometric** - Clean lines, no gradients or photo-realism
2. **ASCII-reproducible** - Can be drawn in a terminal with box/line characters
3. **Favicon-friendly** - Recognizable at 16x16
4. **Iconic** - Describable in one sentence, memorable after seeing once
5. **Crafted feeling** - "Stitched" aesthetic, suggests precision and care
6. **Developer-resonant** - Feels at home in a terminal, README, or IDE

---

## Important: Name Conflict Warning

Research uncovered a significant namespace problem with "Shipyard":

| Conflict | URL | What It Is | Severity |
|----------|-----|-----------|----------|
| **shipyard.build** | shipyard.build | Funded ($2.3M) ephemeral environments company with CLI + MCP server | **CRITICAL** |
| **shipyardapp.com** | shipyardapp.com | DataOps low-code workflow platform | HIGH |
| **Shipyard Software** | shipyardsoftware.org | DeFi company, raised $21M | MEDIUM |
| **github.com/shipyard** | GitHub | Taken by shipyard.build | HIGH |
| **npm `shipyard`** | npm | Taken (dormant MVC framework) | MEDIUM |
| **Submariner Shipyard** | GitHub | K8s multi-cluster testing framework | LOW |

The nautical metaphor space is also heavily occupied by Docker (containers, images, shipping), Kubernetes (helm, pods), Harbor, Istio, Anchor, and Prow.

**Recommendation**: Seriously evaluate whether to keep "Shipyard" or rebrand. See "Name Alternatives" section below.

---

## SVG Prototypes Created

All prototypes are in `assets/logo-concepts/`. View them in a browser.

### Final Candidate: Gantry Crane Mark

**File**: `final-crane-mark.svg` (512px), `final-crane-favicon.svg` (32px)

A gantry crane reduced to pure geometry:
- Three rust rectangles (tower, boom, support leg) form the structural frame
- A teal cable + square block provides accent and focal point
- Base rail grounds the composition

**Why this wins:**
- The crane IS the shipyard. Not the ship, not the ocean - the infrastructure where work is built
- No tech company uses a crane logo - totally ownable
- All straight lines, no curves - pixel-perfect at any resolution
- Reads as an inverted-L frame at 16px, full crane at 512px
- Two-color design (rust + teal accent) maintains brand identity
- Perfectly reproducible as ASCII art

### Other Concepts Explored

| # | Concept | File | Visual Assessment |
|---|---------|------|-------------------|
| A | Crane Refined | `crane-refined.svg` | Nice detail, too illustrative for a logo mark |
| B | **Crane Abstract** | `crane-abstract.svg` | **Winner** - Bold, clean, immediate recognition |
| C | Crane Geometric | `crane-geometric.svg` | Interesting outline style, reads as picture frame |
| D | Cursor on Wave | `cursor-wave.svg` | Beautiful secondary mark, radical simplicity |
| E | Hull Ribs | `hull-ribs.svg` | Unique but too abstract, needs explanation |
| F | Penrose Crane | `penrose-crane.svg` | Impossible illusion doesn't read at small sizes |
| G | Bracket Beams | `bracket-beams.svg` | Too compressed, braces don't read as structure |

### Wordmark Compositions

- `wordmark-dark.svg` - Dark background (navy bg, light text)
- `wordmark-horizontal.svg` - Light background (rust text)

Both use monospace uppercase "SHIPYARD" with the crane mark alongside.

---

## ASCII Art

### CLI Banner (Full)

```
  ║║════════════════╗
  ║║        │       ║
  ║║       [■]      ║║
  ║║                ║║
  ║║                ║║
══╩╩════════════════╩╩══
     S H I P Y A R D
```

### CLI Banner (Compact)

```
  ||=======+======||
  ||       |      ||
  ||      [#]     ||
  ||              ||
====================
    S H I P Y A R D
```

### Inline Mark

```
||===[■]===||  SHIPYARD
```

### Minimal (Code Comments / Bot Signatures)

```
[■] shipyard
```

### README Badge Style

```
 ┌─┬────────┬─┐
 │ │  [■]   │ │  SHIPYARD
 │ │        │ │  where work is built
 └─┴────────┴─┘
```

### Startup Banner (for daemon/CLI)

```
  ╔══════════════════════════╗
  ║  ||========+========||  ║
  ║  ||        |        ||  ║
  ║  ||       [■]       ||  ║
  ║  ||                 ||  ║
  ║  =======================║
  ║                          ║
  ║    S H I P Y A R D       ║
  ║    where work is built    ║
  ╚══════════════════════════╝
```

---

## Color Palette

The existing palette works well with the crane concept and should be kept:

| Token | Value | Use |
|-------|-------|-----|
| **Rust/copper** | `oklch(0.65 0.16 45)` / `#B45A3C` | Primary mark, accent |
| **Dark rust** | `oklch(0.55 0.14 45)` / `#924830` | Secondary/shadow |
| **Light rust** | `oklch(0.75 0.14 45)` / `#D4724E` | Highlights |
| **Teal** | `oklch(0.72 0.14 200)` / `#0D9488` | Hook accent, links |
| **Navy** | `oklch(0.145 0.02 250)` / `#0f172a` | Background |
| **Slate** | `oklch(0.60 0.03 240)` / `#64748b` | Muted text |

The rust/copper + teal combination is distinctive. The teal accent on the hook gives the logo a second color that connects to the existing theme. The navy background is developer-standard dark mode.

---

## Name Alternatives (If Rebranding)

If the namespace conflicts with shipyard.build are deemed serious enough to warrant a rename, the top candidates are:

| Name | Rationale | CLI Feel | Domain |
|------|-----------|----------|--------|
| **Attest** | Directly communicates verification/proof-of-work | `attest verify` | Likely available |
| **Witness** | Human witnesses agent work. Unusual, memorable | `witness check` | Possibly available |
| **Tally** | Counting/verification. Short, punchy | `tally status` | Likely available |
| **Keel** | Nautical but not Docker/K8s territory. Foundation of a ship | `keel sync` | keel.sh conflict |
| **Forge** | Where things are made. Strong, short | `forge verify` | Heavily contested |

The strongest option is **Attest** - it directly communicates the product's core value (verification of AI agent work) and has a clear, uncrowded namespace.

**However**, the user has expressed that "Shipyard feels good." The name is not fatally flawed - it has strong semantics, good dev culture resonance, and the logo/brand identity works well. The conflicts are real but manageable if the product differentiates on features rather than name.

---

## Recommended Identity System

A layered approach with different marks for different contexts:

| Context | Mark | Description |
|---------|------|-------------|
| **App icon / favicon** | Crane mark | `final-crane-favicon.svg` at 32px |
| **Website / docs** | Crane mark + wordmark | `wordmark-dark.svg` |
| **CLI / terminal** | ASCII banner | Compact `||===[■]===||` variant |
| **Loading / splash** | Animated crane | Hook element descends (CSS animation) |
| **Code comments / bot** | Inline mark | `[■] shipyard` |

---

## Files Created

```
assets/logo-concepts/
├── final-crane-mark.svg      # Primary logo (512px)
├── final-crane-favicon.svg   # Favicon optimized (32px)
├── wordmark-horizontal.svg   # Logo + text (light bg)
├── wordmark-dark.svg         # Logo + text (dark bg)
├── crane.svg                 # Detailed crane (exploration)
├── crane-minimal.svg         # Single-color crane
├── crane-abstract.svg        # Abstract crane (base for final)
├── crane-geometric.svg       # Outline/stroke crane
├── crane-refined.svg         # Two-tone detailed crane
├── crane-icon.svg            # Favicon test (64px)
├── cursor-wave.svg           # Alt concept: cursor on wave
├── cursor-wave-icon.svg      # Alt concept: favicon size
├── hull-ribs.svg             # Alt concept: ship skeleton
├── penrose-crane.svg         # Alt concept: impossible triangle
└── bracket-beams.svg         # Alt concept: code brackets
```

## Decision Needed

1. **Approve crane mark** as the new logo direction?
2. **Keep "Shipyard" name** despite namespace conflicts, or explore alternatives?
3. **Keep color palette** as-is, or shift teal toward steel blue?

---

*Created: 2026-02-13*
