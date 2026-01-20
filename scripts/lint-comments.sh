#!/bin/bash
set -e

PACKAGES=(
  "packages/shared"
  "apps/github-oauth-worker"
)

echo "🔍 Checking comment style (ESLint)..."

PATHS=$(printf "%s/src/ " "${PACKAGES[@]}")

if ! pnpm eslint $PATHS --ext .ts,.tsx --max-warnings 0; then
  echo ""
  echo "❌ Comment style violations found!"
  echo ""
  echo "📝 Why this matters:"
  echo "   AI agents often leave noisy single-line comments like:"
  echo "   // This function creates a user  ❌"
  echo ""
  echo "   Use multi-line JSDoc for explanations, or delete the comment if it's noisy."
  echo ""
  echo "🔧 To review and fix manually:"
  echo "   - Read each flagged comment"
  echo "   - Delete if noisy (code should be self-documenting)"
  echo "   - Convert to /** */ if it explains non-obvious 'why'"
  echo ""
  exit 1
fi

echo "✅ Comment style looks good!"
