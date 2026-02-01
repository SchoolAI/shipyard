#!/usr/bin/env bash
set -euo pipefail

# Pre-commit hook: Enforce allowlist for documentation and scripts
# Prevents AI agents from creating/modifying files without explicit approval

# Allowlisted markdown files (entire repo)
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
  "docs/plugin-development.md"
  "docs/cost-analysis.md"

  # Apps
  "apps/github-oauth-worker/README.md"
  "apps/hook/README.md"
  "apps/signaling/README.md"
  "apps/og-proxy-worker/DEPLOYMENT.md"
  "apps/og-proxy-worker/README.md"
  "apps/daemon/AUTO_START.md"

  # Skills
  "skills/shipyard/README.md"
  "skills/shipyard/SKILL.md"
  "skills/shipyard/examples/html-artifacts.md"
  "skills/shipyard/examples/task-example.md"
  "skills/shipyard/examples/video-recording.md"

  # Tests
  "tests/test-comment-replies.md"

  # Config
  ".codex/README.md"
  ".grit/README.md"
  ".claude/plans/custom-comment-system.md"
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

  # Check markdown files
  if [[ "$file" =~ \.md$ ]]; then
    # Exception: docs/wips/ is a sandbox
    if [[ "$file" =~ ^docs/wips/ ]]; then
      continue
    fi

    # Exception: docs/decisions/ (ADRs can be added)
    if [[ "$file" =~ ^docs/decisions/ ]]; then
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
  echo "📋 Documentation changes require intentional approval:"
  echo ""
  echo "  For temporary notes:"
  echo "    → Use docs/wips/ (sandbox, can be deleted anytime)"
  echo ""
  echo "  For permanent documentation:"
  echo "    → Ask user for approval before adding/modifying"
  echo "    → Then add to allowlist in scripts/check-file-allowlist.sh"
  echo ""
  echo "  For architecture decisions:"
  echo "    → Use docs/decisions/ (ADRs are auto-allowed)"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

exit 0
