# Cloudflare Worker Setup Pattern

**Created:** 2026-02-01
**Pattern Origin:** apps/signaling refactor
**Use Case:** Setting up a new Cloudflare Worker with comprehensive testing, linting, and type safety

---

## Overview

This document captures the battle-tested pattern we used for the signaling server refactor. Use this as a template when creating new Cloudflare Workers or similar apps.

**Pattern highlights:**
- Fan-in based test coverage (not blanket percentages)
- Per-package lint scripts (Turborepo caching)
- Istanbul coverage provider (V8 not supported in CF Workers)
- Zod schemas for all request/response bodies
- Typed client for API consumers
- Route constants in shared location

---

## Directory Structure

```
apps/your-worker/
├── src/
│   ├── index.ts                 # Worker entry point, exports default
│   ├── env.ts                   # Zod schema for environment variables
│   ├── auth/                    # Authentication logic
│   │   ├── jwt.ts               # JWT generation/validation
│   │   └── types.ts             # Auth-related types
│   ├── durable-objects/         # Durable Object classes (if needed)
│   │   ├── your-room.ts
│   │   └── types.ts
│   ├── protocol/                # Message types (WebSocket protocols)
│   │   └── messages.ts
│   ├── routes/                  # HTTP route handlers
│   │   ├── routes.ts            # Route constants (re-exported from client)
│   │   ├── health.ts
│   │   ├── auth-*.ts
│   │   └── *.test.ts            # Co-located tests
│   ├── schemas/                 # Zod schemas for validation
│   │   └── index.ts             # All request/response schemas
│   ├── client/                  # Typed client for consumers
│   │   ├── constants.ts         # Route constants (source of truth)
│   │   └── index.ts             # Client class
│   └── utils/                   # Utility functions
│       ├── cors.ts
│       ├── crypto.ts
│       ├── logger.ts
│       └── *.test.ts            # Unit tests for utils
├── scripts/                     # Analysis scripts
│   └── analyze-fan-in.ts        # (symlink to root)
├── wrangler.toml                # Cloudflare Workers config
├── package.json                 # Dependencies + scripts
├── tsconfig.json                # TypeScript config (extends root)
└── vitest.config.ts             # Test config with fan-in coverage
```

---

## Step-by-Step Setup

### 1. Package.json Configuration

```json
{
  "name": "@shipyard/your-worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --env development",
    "deploy": "wrangler deploy",
    "build": "echo 'Cloudflare Workers build via wrangler deploy'",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src && pnpm lint:comments && pnpm lint:typeassertions",
    "lint:fix": "biome check src --write",
    "lint:comments": "eslint 'src/**/*.ts' --rule '@typescript-eslint/consistent-type-assertions: off' --report-unused-disable-directives-severity=off --max-warnings 0",
    "lint:typeassertions": "eslint 'src/**/*.ts' --rule 'local/no-noisy-single-line-comments: off' --rule 'multiline-comment-style: off' --rule 'spaced-comment: off' --report-unused-disable-directives-severity=off --max-warnings 0",
    "analyze:fan-in": "tsx ../../scripts/analyze-fan-in.ts"
  },
  "dependencies": {
    "hono": "^4.7.4",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260122.0",
    "@cloudflare/vitest-pool-workers": "^0.8.0",
    "@vitest/coverage-istanbul": "^3.0.4",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^3.0.4",
    "wrangler": "^4.59.3"
  }
}
```

**Key points:**
- `lint` combines Biome + ESLint (comment/type-assertion rules)
- `lint:comments` and `lint:typeassertions` enable Turborepo caching (per-package)
- `analyze:fan-in` uses shared script from root

### 2. Vitest Configuration (Fan-In Coverage)

```typescript
// vitest.config.ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import viteTsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import {
  DEFAULT_TIER_THRESHOLDS,
  generateCoverageThresholds,
} from '../../scripts/analyze-fan-in'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const fanInEnabled = !process.env.DISABLE_FANIN_COVERAGE
const fanInThresholds = generateCoverageThresholds(
  './src',
  DEFAULT_TIER_THRESHOLDS,
  fanInEnabled,
)

export default defineConfig({
  plugins: [
    viteTsconfigPaths({
      root: __dirname,
      ignoreConfigErrors: true,
    }),
  ],
  test: {
    passWithNoTests: true,
    retry: 0,
    globals: true,
    environment: 'node',
    pool: 'threads',
    poolOptions: {
      threads: {
        isolate: true,
      },
    },
    coverage: {
      provider: 'istanbul', // CRITICAL: V8 not supported in CF Workers
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/test-utils/**',
        'src/**/__tests__/**',
      ],
      thresholds: {
        functions: 30, // Safety net: all files
        ...fanInThresholds, // Dynamic: high fan-in files
      },
    },
    exclude: ['node_modules', 'dist'],
  },
})
```

**Key points:**
- **Use Istanbul, not V8** (V8 requires `node:inspector` which CF Workers don't support)
- Fan-in thresholds apply 60% branch coverage to high-dependency modules
- 30% function coverage as safety net for all files

### 3. TypeScript Configuration

```json
// tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Key points:**
- Extend root `tsconfig.base.json` for consistency
- Include `@cloudflare/vitest-pool-workers` in types for test utilities
- Explicit `rootDir` and `outDir` to override base config

### 4. Wrangler Configuration

```toml
# wrangler.toml
name = "your-worker-name"
main = "src/index.ts"
compatibility_date = "2025-01-01"
account_id = "your_account_id"

# Durable Objects (if needed)
[[durable_objects.bindings]]
name = "YOUR_ROOM"
class_name = "YourRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["YourRoom"]

# Development settings
[dev]
port = 4444
local_protocol = "http"

# Environment variables (non-secret)
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"

# Development overrides
[env.development.vars]
ENVIRONMENT = "development"
LOG_LEVEL = "debug"

# Secrets (set via wrangler secret put):
# - GITHUB_CLIENT_ID
# - GITHUB_CLIENT_SECRET
# - JWT_SECRET
```

### 5. Environment Schema (env.ts)

```typescript
import { z } from 'zod'

export const EnvSchema = z.object({
  ENVIRONMENT: z.enum(['development', 'production']).default('production'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  JWT_SECRET: z.string().min(32),

  // Durable Object bindings
  YOUR_ROOM: z.custom<DurableObjectNamespace>(),
})

export type Env = z.infer<typeof EnvSchema>
```

**Key points:**
- Use Zod for runtime validation
- Document all required secrets in comments
- Define Durable Object namespace types

### 6. Route Constants Pattern

**Source of truth:** `src/client/constants.ts`

```typescript
// src/client/constants.ts
export const ROUTES = {
  HEALTH: "/health",
  AUTH_CALLBACK: "/auth/callback",
  YOUR_ENDPOINT: "/your/:param",
} as const

export const ROUTE_DESCRIPTIONS = [
  `GET ${ROUTES.HEALTH}`,
  `POST ${ROUTES.AUTH_CALLBACK}`,
  `WS ${ROUTES.YOUR_ENDPOINT}`,
] as const
```

**Re-export in routes:** `src/routes/routes.ts`

```typescript
export { ROUTES, ROUTE_DESCRIPTIONS } from '../client/constants'
```

**Why:** Client and routes share constants, preventing drift.

### 7. Schemas Pattern

**All request/response schemas:** `src/schemas/index.ts`

```typescript
import { z } from 'zod'

// Request schemas
export const YourRequestSchema = z.object({
  field: z.string(),
})

// Response schemas
export const YourResponseSchema = z.object({
  result: z.string(),
})

// Error schemas (reusable)
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export const ValidationErrorResponseSchema = ErrorResponseSchema.extend({
  details: z.array(z.object({
    path: z.string(),
    message: z.string(),
  })),
})

// Inferred types
export type YourRequest = z.infer<typeof YourRequestSchema>
export type YourResponse = z.infer<typeof YourResponseSchema>
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>
```

**Use in routes:**

```typescript
import { YourRequestSchema } from '../schemas'

app.post('/your-endpoint', async (c) => {
  const parseResult = YourRequestSchema.safeParse(await c.req.json())
  if (!parseResult.success) {
    return c.json({
      error: 'validation_error',
      message: 'Invalid request',
      details: parseResult.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    }, 400)
  }

  const body = parseResult.data
  // ...
})
```

### 8. Typed Client Pattern

```typescript
// src/client/index.ts
import type { YourRequest, YourResponse } from '../schemas'
import { ROUTES } from './constants'

export class YourClient {
  constructor(private baseUrl: string) {}

  async yourEndpoint(req: YourRequest): Promise<YourResponse> {
    const res = await fetch(`${this.baseUrl}${ROUTES.YOUR_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })

    if (!res.ok) {
      throw new YourClientError(await res.text(), res.status)
    }

    return res.json()
  }

  withAuth(token: string): AuthenticatedYourClient {
    return new AuthenticatedYourClient(this.baseUrl, token)
  }
}

export class AuthenticatedYourClient extends YourClient {
  constructor(baseUrl: string, private token: string) {
    super(baseUrl)
  }

  // Override methods to include auth header
}

export class YourClientError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'YourClientError'
  }
}
```

### 9. Testing Pattern

**Co-locate tests with routes:**

```typescript
// src/routes/your-endpoint.test.ts
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { Env } from '../env'
import { app } from './index'

const testEnv = env as unknown as Env

describe('POST /your-endpoint', () => {
  it('returns 200 for valid request', async () => {
    const res = await app.request('/your-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'value' }),
    }, testEnv)

    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.result).toBe('expected')
  })

  it('returns 400 for missing field', async () => {
    const res = await app.request('/your-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, testEnv)

    expect(res.status).toBe(400)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.error).toBe('validation_error')
  })
})
```

**Test utilities with full coverage:**

```typescript
// src/utils/your-util.test.ts
import { describe, expect, it } from 'vitest'
import { yourUtil } from './your-util'

describe('yourUtil', () => {
  it('handles success case', () => {
    expect(yourUtil('input')).toBe('output')
  })

  it('handles error case', () => {
    expect(() => yourUtil('')).toThrow('Invalid input')
  })

  // Aim for 100% coverage of utilities
})
```

---

## Key Patterns We Followed

### 1. Fan-In Based Coverage (Not Blanket %)

**Traditional approach (bad):**
```json
"coverage": {
  "branches": 80,
  "functions": 80,
  "lines": 80
}
```

**Our approach (good):**
```json
"coverage": {
  "functions": 30,  // Safety net only
  "...fanInThresholds": {
    // Dynamic based on dependency count:
    // fan-in >= 10 → 60% branches
    // fan-in >= 5 → 60% branches
    // fan-in >= 3 → 60% branches
    // fan-in < 3 → global default only
  }
}
```

**Why:** Tests high-impact code (shared infrastructure) strictly, allows flexibility for single-use code.

**Run analysis:**
```bash
pnpm --filter @your-worker analyze:fan-in
```

### 2. Per-Package Lint Scripts (Turborepo Caching)

**Bad (global scripts):**
```bash
# Root package.json
pnpm lint:comments  # Re-lints ALL packages every time
```

**Good (per-package scripts):**
```bash
# Each package has its own lint scripts
# Root runs via Turborepo for caching
pnpm turbo run lint
```

**Why:** Turborepo caches results per-package. Only changed packages re-lint.

### 3. Route Constants in Client (Single Source of Truth)

**Bad:**
```typescript
// routes/your-route.ts
app.post('/your-endpoint', ...)

// client/index.ts
async yourEndpoint() {
  await fetch('/your-endpoint', ...)  // Can drift!
}
```

**Good:**
```typescript
// client/constants.ts (source of truth)
export const ROUTES = { YOUR_ENDPOINT: '/your-endpoint' }

// routes/your-route.ts
import { ROUTES } from '../client/constants'
app.post(ROUTES.YOUR_ENDPOINT, ...)

// client/index.ts
async yourEndpoint() {
  await fetch(this.baseUrl + ROUTES.YOUR_ENDPOINT, ...)
}
```

### 4. Zod Everywhere (Runtime Safety)

**Pattern:**
1. Define schemas in `src/schemas/index.ts`
2. Use `.safeParse()` in routes for validation
3. Infer TypeScript types from schemas
4. Client uses same types for calls

**Why:** Single schema → runtime validation + compile-time types + client types.

### 5. Istanbul Coverage (Not V8)

**Critical for Cloudflare Workers:**
```typescript
coverage: {
  provider: 'istanbul',  // NOT 'v8'
}
```

**Why:** V8 coverage requires `node:inspector` module which doesn't exist in CF Workers runtime.

---

## Verification Checklist

After setting up a new worker, verify:

```bash
# 1. Tests pass
pnpm --filter @your-worker test
# ✅ All tests pass

# 2. Coverage meets thresholds
pnpm --filter @your-worker test:coverage
# ✅ High fan-in files meet 60% branches
# ✅ All files meet 30% functions

# 3. Typecheck passes
pnpm --filter @your-worker typecheck
# ✅ No TypeScript errors

# 4. Lint passes
pnpm --filter @your-worker lint
# ✅ Biome + ESLint (comments + type assertions)

# 5. Fan-in analysis shows coverage model
pnpm --filter @your-worker analyze:fan-in
# ✅ See which files require strict coverage

# 6. Server starts
pnpm --filter @your-worker dev
# ✅ Server running on configured port

# 7. Health check
curl http://localhost:4444/health
# ✅ {"status":"ok"}
```

---

## Secrets Management

**Development:** Create `.dev.vars` (gitignored):
```
GITHUB_CLIENT_ID=test_client_id
GITHUB_CLIENT_SECRET=test_client_secret
JWT_SECRET=test_jwt_secret_minimum_32_characters_long
```

**Production:** Use wrangler secrets:
```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET
```

**Never commit secrets to wrangler.toml!**

---

## Deployment

```bash
# Deploy to production
pnpm --filter @your-worker deploy

# Tail logs
pnpm --filter @your-worker tail

# Check deployed status
wrangler deployments list
```

---

## References

- **Signaling implementation:** `apps/signaling/` (reference implementation)
- **Fan-in analysis:** `scripts/analyze-fan-in.ts`
- **Engineering standards:** `docs/engineering-standards.md`
- **Root ESLint config:** `eslint.config.mjs` (custom rules)

---

## Common Gotchas

1. **V8 coverage doesn't work** → Use Istanbul provider
2. **Global lint scripts miss Turborepo cache** → Use per-package scripts
3. **Route strings drift between client/server** → Use shared constants
4. **No Durable Object types in tests** → Add `@cloudflare/vitest-pool-workers` to tsconfig types
5. **Biome auto-fix breaks ESLint rules** → Run ESLint separately via npm scripts

---

*Last updated: 2026-02-01*
*Pattern validated on: apps/signaling (107 tests, 0 errors)*
