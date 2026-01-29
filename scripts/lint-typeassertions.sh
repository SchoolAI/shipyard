#!/bin/bash
set -e

# Type Assertion Enforcement Script
# ==================================
# Runs ESLint to enforce no type assertions (except `as const`).
#
# Opt-out approach: lint everything except explicitly excluded paths
# New packages are automatically covered

EXCLUDE_PATTERNS=(
  "node_modules"
  "dist"
  "build"
  "*.config.*"
  "spikes"
  "**/*.test.ts"
  "**/*.test.tsx"
  "**/__tests__/**"
)

echo "Checking type assertions (ESLint)..."

# Build ignore args
IGNORE_ARGS=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
  IGNORE_ARGS="$IGNORE_ARGS --ignore-pattern \"$pattern\""
done

# Lint all ts/tsx files in apps/ and packages/
# Note: --no-error-on-unmatched-pattern handles missing .tsx in packages/
# Only check type assertion rule (disable comment rules which are checked separately)
# --report-unused-disable-directives-severity=off prevents warnings about disabled rules
if ! eval "pnpm eslint 'apps/**/*.ts' 'apps/**/*.tsx' 'packages/**/*.ts' 'packages/**/*.tsx' $IGNORE_ARGS --no-error-on-unmatched-pattern --rule 'local/no-noisy-single-line-comments: off' --rule 'multiline-comment-style: off' --rule 'spaced-comment: off' --report-unused-disable-directives-severity=off --max-warnings 0" 2>&1; then
  echo ""
  echo "Type assertion violations found!"
  echo ""
  echo "Why this matters:"
  echo "   Type assertions (as X) bypass TypeScript's type checking."
  echo "   They hide bugs and make refactoring dangerous."
  echo ""
  echo "Allowed patterns:"
  echo "   - as const (narrows to literal types)"
  echo "   - as never (in exhaustive switch default cases)"
  echo ""
  echo "To fix violations:"
  echo "   1. Use type guards: if (isUser(x)) { ... }"
  echo "   2. Use generics: function get<T>(key: string): T"
  echo "   3. Fix the types: Update the source to return correct type"
  echo "   4. Use Zod: schema.parse(data) returns typed result"
  echo ""
  echo "If assertion is truly unavoidable:"
  echo "   Add eslint-disable comment with explanation:"
  echo "   // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- reason"
  echo ""
  exit 1
fi

echo "Type assertion checks passed!"
