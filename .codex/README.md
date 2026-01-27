# Codex Configuration

This directory contains Codex CLI-specific configuration for the Shipyard project.

## Directory Structure

```
.codex/
├── skills/
│   └── shipyard/           # Symlinked to ../../skills/shipyard/
│       ├── SKILL.md        # Codex skill definition (symlink)
│       ├── README.md       # Skill documentation (symlink)
│       └── examples/       # Usage examples (symlink)
└── README.md               # This file
```

## Skills

All skill files are **symlinked** from `skills/shipyard/` to avoid duplication:

```bash
.codex/skills/shipyard/SKILL.md -> ../../../skills/shipyard/SKILL.md
.codex/skills/shipyard/examples/ -> ../../../skills/shipyard/examples/
.codex/skills/shipyard/README.md -> ../../../skills/shipyard/README.md
```

**Why symlinks?**
- Single source of truth (no duplicate content)
- Changes in `skills/` automatically available to Codex
- Claude Code and Codex share the same skill content

## Skill Format Compatibility

The skill description in `skills/shipyard/SKILL.md` uses a **single-line format** to work with both Claude Code and Codex:

```yaml
---
name: shipyard
# prettier-ignore
description: "Single line description here..."
---
```

This is required because:
- **Codex**: Requires single-line description (max 500 chars)
- **Claude Code**: Multi-line descriptions cause a [known parser bug (#11322)](https://github.com/anthropics/claude-code/issues/11322)
- The `# prettier-ignore` comment prevents formatters from breaking it

## Installation for Codex Users

The skill is already available at the repo level:

```bash
# Codex will discover it automatically from:
$REPO_ROOT/.codex/skills/shipyard/

# For user-scoped global install:
mkdir -p ~/.codex/skills/shipyard
cp -r .codex/skills/shipyard/* ~/.codex/skills/shipyard/
```

## Usage in Codex

```bash
# Explicit invocation
$shipyard

# Implicit (Codex selects automatically)
# Just ask: "Create a task for adding dark mode"
```

## References

- [OpenAI Codex Skills Documentation](https://developers.openai.com/codex/skills/)
- [Codex Skill Format Specification](https://developers.openai.com/codex/skills/create-skill/)
