#!/usr/bin/env bash
set -euo pipefail

# Pre-commit hook: Enforce allowlist for documentation and scripts
# Prevents AI agents from creating/modifying files without explicit approval

# Allowlisted markdown/text files (entire repo - complete inventory)
ALLOWED_DOCS=(
  # Root level
  "README.md"
  "AGENTS.md"
  "CLAUDE.md"
  "LICENSE.md"

  # Core docs
  "docs/architecture.md"
  "docs/development.md"
  "docs/engineering-standards.md"
  "docs/installation.md"
  "docs/releasing.md"

  # ADRs (require explicit listing, not auto-allowed)
  "docs/decisions/0001-use-yjs-not-loro.md"
  "docs/decisions/0002-use-sonner-for-toasts.md"
  "docs/decisions/0003-mobile-oauth-user-agent-detection.md"
  "docs/decisions/0004-validation-boundaries.md"
  "docs/decisions/0005-rebrand-peer-plan-to-shipyard.md"
  "docs/decisions/0006-webrtc-p2p-sync-infrastructure.md"
  "docs/decisions/template.md"

  # Skills
  "skills/shipyard/README.md"
  "skills/shipyard/SKILL.md"
  "skills/shipyard/examples/html-artifacts.md"
  "skills/shipyard/examples/task-example.md"
  "skills/shipyard/examples/video-recording.md"

  # Config
  ".codex/README.md"
  ".grit/README.md"
)

# Allowlisted scripts
ALLOWED_SCRIPTS=(
  "scripts/check-npm-deps.js"
  "scripts/dev-all.sh"
  "scripts/dev-isolated.sh"
  "scripts/dev-local.sh"
  "scripts/cleanup.sh"
  "scripts/reset-all.sh"
  "scripts/hooks-local.sh"
  "scripts/hooks-prod.sh"
  "scripts/lint-comments.sh"
  "scripts/lint-typeassertions.sh"
  "scripts/setup-hooks-dev.sh"
  "scripts/restore-hooks-prod.sh"
  "scripts/claude-shim.sh"
  "scripts/worktree-env.sh"
  "scripts/generate-icons.py"
  "scripts/inspect-plan.mjs"
  "scripts/check-file-allowlist.sh"
)

# Get staged files (new or modified)
staged_files=$(git diff --cached --name-only --diff-filter=AM)

violations=()

while IFS= read -r file; do
  # Skip empty lines
  [[ -z "$file" ]] && continue

  # Skip node_modules and hidden files
  [[ "$file" =~ node_modules ]] && continue
  [[ "$file" =~ ^\. ]] && [[ ! "$file" =~ ^\.claude/ ]] && [[ ! "$file" =~ ^\.codex/ ]] && [[ ! "$file" =~ ^\.grit/ ]] && continue

  # Check markdown and text files
  if [[ "$file" =~ \.(md|txt)$ ]]; then
    # Exception: docs/whips/ is a sandbox
    if [[ "$file" =~ ^docs/whips/ ]]; then
      continue
    fi

    # Exception: spikes/ is POC code (can change freely)
    if [[ "$file" =~ ^spikes/ ]]; then
      continue
    fi

    # Check if in allowlist
    is_allowed=false
    for allowed in "${ALLOWED_DOCS[@]}"; do
      if [[ "$file" == "$allowed" ]]; then
        is_allowed=true
        break
      fi
    done

    if [[ "$is_allowed" == false ]]; then
      violations+=("$file")
    fi
  fi

  # Check scripts
  if [[ "$file" =~ ^scripts/ ]]; then
    is_allowed=false
    for allowed in "${ALLOWED_SCRIPTS[@]}"; do
      if [[ "$file" == "$allowed" ]]; then
        is_allowed=true
        break
      fi
    done

    if [[ "$is_allowed" == false ]]; then
      violations+=("$file")
    fi
  fi
done <<< "$staged_files"

if [[ ${#violations[@]} -gt 0 ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ BLOCKED: Files not in allowlist"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  for file in "${violations[@]}"; do
    echo "  • $file"
  done
  echo ""
  echo "⚠️  STOP: Getting this error means you should ASK THE USER first."
  echo ""
  echo "Documentation should NOT be created casually. Consider:"
  echo ""
  echo "  1. Is this actually needed, or can the code be self-documenting?"
  echo ""
  echo "  2. If temporary/scratch notes:"
  echo "     → Use docs/whips/ (sandbox for working docs)"
  echo ""
  echo "  3. If permanent documentation:"
  echo "     → ASK USER for approval before creating"
  echo "     → Explain why this doc is needed"
  echo "     → User will decide if it should be added to allowlist"
  echo ""
  echo "  4. If architecture decision:"
  echo "     → Create ADR in docs/decisions/"
  echo "     → User will add to allowlist after review"
  echo ""
  echo "⚠️  Do NOT mechanically add files to the allowlist without user approval."
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

exit 0
