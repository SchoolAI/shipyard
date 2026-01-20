#!/bin/bash
set -e

PACKAGES=(
  "packages/shared"
  "packages/schema"
  "apps/github-oauth-worker"
  "apps/signaling"
  "apps/hook"
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
  echo "✅ Valid single-line comment patterns:"
  echo "   // NOTE: Explains non-obvious 'why' (security, performance, constraints)"
  echo "   // TODO: Tracked work items"
  echo "   // FIXME: Known issues"
  echo "   // @ts-expect-error: TypeScript directives"
  echo "   // biome-ignore: Linter exceptions with justification"
  echo ""
  echo "🔧 To fix violations:"
  echo "   1. DELETE if comment describes 'what' code does (code should be self-documenting)"
  echo "   2. Convert to /** */ multi-line if explaining non-obvious 'why'"
  echo "   3. Add NOTE: prefix if keeping as single-line"
  echo ""
  exit 1
fi

echo "✅ Comment style looks good!"
