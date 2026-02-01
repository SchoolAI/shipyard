#!/usr/bin/env bash
set -euo pipefail

# Validation script: Check ALL existing files against allowlist
# Unlike pre-commit hook, this checks the entire repo state

# Source the allowlist from the pre-commit script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define allowlists inline (keep in sync with check-file-allowlist.sh)
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
  "scripts/validate-file-allowlist.sh"
)

# Find all markdown and text files (excluding node_modules, .git, loro-extended-repo)
all_files=$(find . -type f \( -name "*.md" -o -name "*.txt" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/spikes/loro-extended-repo/*" \
  -not -path "*/dist/*" \
  | sed 's|^\./||')

violations=()

while IFS= read -r file; do
  # Skip empty lines
  [[ -z "$file" ]] && continue

  # Exception: docs/whips/ is a sandbox
  if [[ "$file" =~ ^docs/whips/ ]]; then
    continue
  fi

  # Exception: spikes/ is POC code (can change freely)
  if [[ "$file" =~ ^spikes/ ]]; then
    continue
  fi

  # Check if in docs allowlist
  if [[ "$file" =~ \.(md|txt)$ ]]; then
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

  # Check if in scripts allowlist
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
done <<< "$all_files"

if [[ ${#violations[@]} -gt 0 ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ VALIDATION FAILED: Files exist that are not in allowlist"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "The following files are not in the allowlist:"
  echo ""
  for file in "${violations[@]}"; do
    echo "  • $file"
  done
  echo ""
  echo "To fix:"
  echo "  1. If temporary: Move to docs/whips/"
  echo "  2. If permanent: Add to allowlist in scripts/check-file-allowlist.sh AND scripts/validate-file-allowlist.sh"
  echo "  3. If architecture decision: Add ADR to docs/decisions/ AND update allowlist"
  echo "  4. If obsolete: Delete the file"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

file_count=$(echo "$all_files" | grep -c . || echo 0)
echo "✅ File allowlist validation passed ($file_count files checked)"
exit 0
