#!/bin/bash
set -e

# Type Assertion Enforcement Script
# ==================================
# Runs ESLint to enforce no type assertions (except `as const`).

PACKAGES=(
  "packages/shared"
  "packages/schema"
  "apps/github-oauth-worker"
  "apps/signaling/src"
  "apps/signaling/cloudflare"
  "apps/signaling/core"
  "apps/signaling/node"
  "apps/server"
  "apps/hook"
  "apps/web"
)

echo "Checking type assertions (ESLint)..."

PATHS=""
for pkg in "${PACKAGES[@]}"; do
  if [ -d "$pkg/src" ]; then
    PATHS="$PATHS $pkg/src/"
  elif [ -d "$pkg" ]; then
    PATHS="$PATHS $pkg/"
  fi
done

if [ -z "$PATHS" ]; then
  echo "No packages configured for type assertion checking."
  exit 0
fi

# Run ESLint with type assertion rules (exclude test files)
if ! pnpm eslint $PATHS --ext .ts,.tsx --ignore-pattern "**/*.test.ts" --ignore-pattern "**/__tests__/**" --max-warnings 0 2>&1; then
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
