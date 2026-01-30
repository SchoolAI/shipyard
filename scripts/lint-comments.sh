#!/bin/bash
set -e

EXCLUDE_PATTERNS=(
  "node_modules"
  "dist"
  "build"
  ".wrangler"
  "*.config.*"
  "spikes"
)

# Must match allowedPatterns in eslint-local-rules.mjs
ALLOWED_PREFIXES=(
  "NOTE:"
  "TODO"
  "FIXME"
  "HACK"
  "XXX"
  "@ts-"
  "biome-ignore"
)

echo "🔍 Checking comment style (ESLint)..."

# Build ignore args
IGNORE_ARGS=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
  IGNORE_ARGS="$IGNORE_ARGS --ignore-pattern \"$pattern\""
done

# Lint all ts/tsx files in apps/ and packages/
# Note: --no-error-on-unmatched-pattern handles missing .tsx in packages/
# Only check comment-related rules (disable type assertion rule which is checked separately)
# --report-unused-disable-directives-severity=off prevents warnings about disabled rules
if ! eval "pnpm eslint 'apps/**/*.ts' 'apps/**/*.tsx' 'packages/**/*.ts' 'packages/**/*.tsx' $IGNORE_ARGS --no-error-on-unmatched-pattern --rule '@typescript-eslint/consistent-type-assertions: off' --report-unused-disable-directives-severity=off --max-warnings 0"; then
  echo ""
  echo "❌ Comment style violations found!"
  echo ""
  echo "📝 Why this matters:"
  echo "   AI agents often leave noisy single-line comments like:"
  echo "   // This function creates a user  ❌"
  echo ""
  echo "✅ Valid single-line comment patterns:"
  for prefix in "${ALLOWED_PREFIXES[@]}"; do
    echo "   // ${prefix}"
  done
  echo ""
  echo "🔧 To fix violations:"
  echo "   1. DELETE if comment describes 'what' code does (code should be self-documenting)"
  echo "   2. Convert to /** */ JSDoc if explaining non-obvious 'why'"
  echo "   3. Add NOTE: prefix if keeping as single-line"
  echo ""
  exit 1
fi

echo "✅ Comment style looks good!"
