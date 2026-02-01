# New Signaling Server Scaffold

**Created:** 2026-01-31
**Status:** ✅ Completed (2026-02-01)
**Scope:** Directory structure and file responsibilities for new signaling worker

**Outcome:** Successfully implemented in `apps/signaling/` with full test coverage and production readiness.

---

## Tech Decisions

### Framework: Hono

**Why Hono over alternatives:**

| Framework | Speed | Bundle | Workers Native | WebSocket Support |
|-----------|-------|--------|----------------|-------------------|
| **Hono** | 934K ops/sec | 14KB | Yes (designed for it) | Built-in helper |
| itty-router | 212K ops/sec | ~1KB | Yes | Manual |
| Express | N/A | 572KB | Recently (2025) | Manual |
| Fastify | N/A | N/A | No | N/A |

- **~6x faster** than itty-router for routing
- **Native WebSocket support** via `upgradeWebSocket` helper
- **Used by Cloudflare internally** (D1, Workers Logs, KV, Queues)
- **Built-in middleware**: CORS, JWT, Bearer auth
- **First-class TypeScript**

### Testing: TDD with Integration Coverage Enforcement

Routes directory will be added to `tests/integration-coverage.test.ts`:

```typescript
// Add to COVERAGE_REQUIREMENTS array
{
  sourceDir: 'apps/signaling/src/routes',
  testSuffix: '.test.ts',
  sourcePattern: /^(?!.*\.test\.ts$).*\.ts$/,
  description: 'Signaling Routes',
},
```

This enforces that every route file has a corresponding test file.

---

## Current vs New Architecture

### What We're Keeping

| Pattern | Why |
|---------|-----|
| Platform adapter abstraction | Clean separation of core logic from platform |
| Hibernation-friendly design | Cost-effective at scale |
| Hash-based token storage | Security best practice |
| Timing-safe comparisons | Prevents timing attacks |
| WebSocket attachments for state | Survives hibernation |

### What We're Changing

| Current | New | Why |
|---------|-----|-----|
| Single global DO | PersonalRoom + CollabRoom DOs | Room topology for agent monitoring |
| GitHub token per request | Shipyard JWT | One-time OAuth, then signature verification |
| y-webrtc protocol | Custom + loro WebRTC adapter | loro-extended doesn't use y-webrtc |
| Invite tokens for access | Pre-signed URLs for collab rooms | Simpler, time-limited |
| Plan-based topics | User-based Personal Rooms | Agent registry per user |
| Separate OAuth worker | Merged into signaling | Same trust boundary |

### What We're Removing

| Feature | Why |
|---------|-----|
| Two-message auth pattern | Was for y-webrtc compatibility; loro-extended doesn't need it |
| Node.js adapter | Use `wrangler dev` for local development |
| Topic-based pub/sub | Replaced by room-based routing |
| Epoch validation | Loro handles this internally |

---

## New Directory Structure

All files use **kebab-case** per engineering standards.

```
apps/signaling/
├── src/
│   ├── index.ts                    # Hono app entry, exports DOs
│   ├── env.ts                      # Env schema (Zod) + validation
│   │
│   ├── routes/                     # All public endpoints (TDD enforced)
│   │   ├── index.ts                # Route registry, creates Hono app
│   │   ├── health.ts               # GET /health
│   │   ├── health.test.ts          # Integration test
│   │   ├── auth-github.ts          # POST /auth/github/callback
│   │   ├── auth-github.test.ts     # Integration test
│   │   ├── collab-create.ts        # POST /collab/create
│   │   ├── collab-create.test.ts   # Integration test
│   │   ├── ws-personal.ts          # WS /personal/{userId}
│   │   ├── ws-personal.test.ts     # Integration test
│   │   ├── ws-collab.ts            # WS /collab/{roomId}
│   │   └── ws-collab.test.ts       # Integration test
│   │
│   ├── durable-objects/            # Stateful workers
│   │   ├── index.ts                # DO exports
│   │   ├── personal-room.ts        # PersonalRoom DO class
│   │   ├── collab-room.ts          # CollabRoom DO class
│   │   └── types.ts                # DO state types
│   │
│   ├── auth/                       # Auth utilities (not routes)
│   │   ├── index.ts                # Auth exports
│   │   ├── jwt.ts                  # Shipyard JWT sign + verify
│   │   ├── github.ts               # GitHub API helpers
│   │   └── types.ts                # Claims, user types
│   │
│   ├── protocol/                   # WebSocket protocol
│   │   ├── index.ts                # Protocol exports
│   │   ├── messages.ts             # Zod schemas for all messages
│   │   └── webrtc-relay.ts         # WebRTC signaling relay logic
│   │
│   └── utils/                      # Shared utilities
│       ├── index.ts                # Utils exports
│       ├── cors.ts                 # CORS config (from oauth worker)
│       ├── crypto.ts               # Hash, timing-safe compare
│       ├── logger.ts               # Unified logger
│       └── presigned-url.ts        # Pre-signed URL tokens
│
├── wrangler.toml                   # Cloudflare config
├── package.json
├── tsconfig.json
└── README.md
```

---

## File Responsibilities

### Entry Point

#### `src/index.ts`
Minimal entry point - imports Hono app, exports DOs.

```typescript
import { app } from './routes';
export { PersonalRoom } from './durable-objects/personal-room';
export { CollabRoom } from './durable-objects/collab-room';

export default app;
```

#### `src/routes/index.ts`
Hono app with all routes registered.

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from '../env';

import { healthRoute } from './health';
import { authGitHubRoute } from './auth-github';
import { collabCreateRoute } from './collab-create';
import { wsPersonalRoute } from './ws-personal';
import { wsCollabRoute } from './ws-collab';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin, c) => {
    // Production: whitelist, Dev: localhost
    if (c.env.ENVIRONMENT === 'production') {
      const allowed = ['https://shipyard.pages.dev', 'https://schoolai.github.io'];
      return allowed.includes(origin) ? origin : null;
    }
    // Dev: any localhost
    if (origin?.includes('localhost') || origin?.includes('127.0.0.1')) {
      return origin;
    }
    return null;
  },
}));

// Routes
app.route('/', healthRoute);
app.route('/', authGitHubRoute);
app.route('/', collabCreateRoute);
app.route('/', wsPersonalRoute);
app.route('/', wsCollabRoute);

export { app };
```

#### Example Route: `src/routes/health.ts`

```typescript
import { Hono } from 'hono';
import type { Env } from '../env';

const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'shipyard-signaling',
    environment: c.env.ENVIRONMENT,
  });
});

export { healthRoute };
```

#### Example WebSocket Route: `src/routes/ws-personal.ts`

```typescript
import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/cloudflare-workers';
import type { Env } from '../env';
import { validateToken } from '../auth/jwt';

const wsPersonalRoute = new Hono<{ Bindings: Env }>();

wsPersonalRoute.get('/personal/:userId', upgradeWebSocket((c) => {
  const userId = c.req.param('userId');
  const token = c.req.query('token');

  // Validate JWT
  const claims = validateToken(token, c.env.JWT_SECRET);
  if (!claims || claims.sub !== userId) {
    // Can't reject here easily - handle in onOpen
  }

  // Get Durable Object for this user
  const roomId = c.env.PERSONAL_ROOM.idFromName(userId);
  const room = c.env.PERSONAL_ROOM.get(roomId);

  return {
    onOpen(evt, ws) {
      // Forward to DO
    },
    onMessage(evt, ws) {
      // Forward to DO
    },
    onClose(evt, ws) {
      // Notify DO
    },
  };
}));

export { wsPersonalRoute };
```

#### `src/env.ts`
Environment schema with Zod validation (uses shared loader from `@shipyard/shared`).

```typescript
import { z } from 'zod';
import { loadWorkerEnv, LogLevelSchema, EnvironmentSchema } from '@shipyard/shared/env';

// Schema for worker env
const EnvSchema = z.object({
  // Durable Objects (runtime bindings, can't validate shape)
  PERSONAL_ROOM: z.custom<DurableObjectNamespace>(),
  COLLAB_ROOM: z.custom<DurableObjectNamespace>(),

  // Secrets
  GITHUB_CLIENT_ID: z.string().min(1, 'GITHUB_CLIENT_ID required'),
  GITHUB_CLIENT_SECRET: z.string().min(1, 'GITHUB_CLIENT_SECRET required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),

  // Config (from @shipyard/shared)
  ENVIRONMENT: EnvironmentSchema,
  LOG_LEVEL: LogLevelSchema.optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validate env at worker startup */
export function parseEnv(env: unknown): Env {
  return loadWorkerEnv(EnvSchema, env);
}
```

**Note:** Shared env utilities to be added to `packages/shared/src/env/`:
- `loadEnv()` - For Node.js apps (parses `process.env`)
- `loadWorkerEnv()` - For Cloudflare Workers (validates `env` param)
- `LogLevelSchema`, `EnvironmentSchema` - Reusable Zod schemas

---

### Auth Module

#### `src/auth/oauth.ts`
GitHub OAuth token exchange (from oauth worker).

**Responsibilities:**
- Handle `/auth/github/callback` POST
- Exchange authorization code for GitHub token
- Fetch user info from GitHub API
- Issue Shipyard JWT
- Return JWT to browser

```typescript
// Key function
export async function handleGitHubCallback(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Parse code from request body
  // 2. Exchange code for GitHub token
  // 3. Fetch user info (username, id)
  // 4. Generate Shipyard JWT with user claims
  // 5. Return { token: shipyardJWT, user: { id, username } }
}
```

#### `src/auth/jwt.ts`
Shipyard JWT generation and validation.

**Responsibilities:**
- Generate session JWTs (for browsers)
- Generate agent JWTs (scoped to task)
- Validate JWT signature
- Extract claims from JWT

```typescript
export interface ShipyardJWTClaims {
  sub: string;           // Shipyard user ID (internal)
  ghUser: string;        // GitHub username
  ghId: number;          // GitHub user ID
  iat: number;           // Issued at
  exp: number;           // Expiration
  scope?: string;        // Optional: 'task:abc123' for agent tokens
  machineId?: string;    // Optional: for agent tokens
}

export function generateSessionToken(user: GitHubUser, env: Env): string;
export function generateAgentToken(user: GitHubUser, taskId: string, machineId: string, env: Env): string;
export function validateToken(token: string, env: Env): ShipyardJWTClaims | null;
```

#### `src/auth/types.ts`
Auth-related type definitions.

```typescript
export interface GitHubUser {
  id: number;
  login: string;
  // ... other fields we care about
}

export interface TokenExchangeRequest {
  code: string;
  redirect_uri: string;
}

export interface TokenExchangeResponse {
  token: string;           // Shipyard JWT
  user: {
    id: string;            // Internal Shipyard ID
    username: string;      // GitHub username
  };
  is_mobile?: boolean;     // For deep link prevention
}
```

---

### Rooms Module

#### `src/rooms/personal-room.ts`
PersonalRoom Durable Object - one per user.

**Responsibilities:**
- Authenticate user on connect (validate Shipyard JWT)
- Maintain agent registry (which agents are online per machine)
- Track browser sessions (for multi-device)
- Relay WebRTC signaling for browser↔daemon connections
- Handle agent status updates

```typescript
export class PersonalRoom extends DurableObject {
  // State
  private agents: Map<string, AgentInfo>;       // agentId -> info
  private browsers: Map<WebSocket, BrowserInfo>;

  // Hibernation-aware
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(() => this.initialize());
  }

  async fetch(request: Request): Promise<Response> {
    // Validate JWT from query param or header
    // Accept WebSocket with hibernation
    // Return connection
  }

  // WebSocket handlers
  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    // Handle: register-agent, unregister-agent, agent-status
    // Handle: webrtc-offer, webrtc-answer, webrtc-ice (relay)
    // Handle: spawn-agent-request (from browser to daemon)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Clean up agent registration or browser session
  }
}
```

**Message Types for PersonalRoom:**
```typescript
type PersonalRoomMessage =
  // Agent registration (from daemon)
  | { type: 'register-agent'; agentId: string; machineId: string; agentType: string }
  | { type: 'unregister-agent'; agentId: string }
  | { type: 'agent-status'; agentId: string; status: 'idle' | 'running' | 'error' }

  // WebRTC signaling (browser↔daemon)
  | { type: 'webrtc-offer'; targetMachineId: string; offer: RTCSessionDescription }
  | { type: 'webrtc-answer'; targetMachineId: string; answer: RTCSessionDescription }
  | { type: 'webrtc-ice'; targetMachineId: string; candidate: RTCIceCandidate }

  // Agent spawning (browser→daemon via signaling)
  | { type: 'spawn-agent'; machineId: string; taskId: string; prompt: string; cwd?: string }
  | { type: 'spawn-result'; taskId: string; success: boolean; error?: string };
```

#### `src/rooms/collab-room.ts`
CollabRoom Durable Object - ad-hoc for shared sessions.

**Responsibilities:**
- Validate pre-signed URL on connect
- Track participants
- Relay WebRTC signaling between participants
- Expire after timeout or when empty

```typescript
export class CollabRoom extends DurableObject {
  // State
  private participants: Map<WebSocket, ParticipantInfo>;
  private taskId: string | null;
  private ownerId: string | null;
  private expiresAt: number | null;

  async fetch(request: Request): Promise<Response> {
    // Validate pre-signed URL token
    // Accept WebSocket with hibernation
    // Return connection
  }

  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    // Handle: webrtc-offer, webrtc-answer, webrtc-ice (relay between participants)
    // Handle: participant-joined, participant-left (broadcast)
  }

  async alarm(): Promise<void> {
    // Clean up expired room
  }
}
```

#### `src/rooms/types.ts`
Room state type definitions.

```typescript
export interface AgentInfo {
  agentId: string;
  machineId: string;
  machineName: string;
  agentType: string;
  status: 'idle' | 'running' | 'error';
  activeTaskId?: string;
  registeredAt: number;
  lastSeenAt: number;
}

export interface BrowserInfo {
  sessionId: string;
  connectedAt: number;
  userAgent?: string;
}

export interface ParticipantInfo {
  userId: string;
  username: string;
  joinedAt: number;
  role: 'owner' | 'collaborator';
}
```

---

### Protocol Module

#### `src/protocol/messages.ts`
Message type definitions with Zod schemas.

```typescript
import { z } from 'zod';

// Personal Room messages
export const RegisterAgentSchema = z.object({
  type: z.literal('register-agent'),
  agentId: z.string(),
  machineId: z.string(),
  machineName: z.string(),
  agentType: z.string(),
});

// ... other message schemas

// Union of all messages
export const PersonalRoomMessageSchema = z.discriminatedUnion('type', [
  RegisterAgentSchema,
  UnregisterAgentSchema,
  AgentStatusSchema,
  WebRTCOfferSchema,
  WebRTCAnswerSchema,
  WebRTCIceSchema,
  SpawnAgentSchema,
  SpawnResultSchema,
]);

export type PersonalRoomMessage = z.infer<typeof PersonalRoomMessageSchema>;
```

#### `src/protocol/webrtc-signaling.ts`
WebRTC signaling relay logic.

```typescript
// Relay WebRTC messages between peers
// Browser sends offer → signaling → daemon
// Daemon sends answer → signaling → browser
// Both exchange ICE candidates via signaling

export function relayWebRTCMessage(
  fromWs: WebSocket,
  message: WebRTCSignalingMessage,
  findTarget: (targetId: string) => WebSocket | null
): void {
  const targetWs = findTarget(message.targetMachineId);
  if (targetWs) {
    targetWs.send(JSON.stringify(message));
  }
}
```

---

### Utils Module

#### `src/utils/cors.ts`
Unified CORS configuration.

```typescript
const ALLOWED_ORIGINS_PRODUCTION = [
  'https://shipyard.pages.dev',
  'https://schoolai.github.io',
];

export function isAllowedOrigin(origin: string | null, env: Env): boolean;
export function getCorsHeaders(origin: string, env: Env): Record<string, string>;
export function handleCorsPreFlight(request: Request, env: Env): Response;
```

#### `src/utils/presigned-url.ts`
Pre-signed URL generation and validation for collab rooms.

```typescript
export interface PresignedUrlPayload {
  roomId: string;
  taskId: string;
  inviterId: string;
  exp: number;
}

export function generatePresignedUrl(
  baseUrl: string,
  payload: PresignedUrlPayload,
  secret: string
): string;

export function validatePresignedUrl(
  token: string,
  secret: string
): PresignedUrlPayload | null;
```

#### `src/utils/crypto.ts`
Cryptographic utilities.

```typescript
export function hashValue(value: string): Promise<string>;
export function timingSafeCompare(a: string, b: string): boolean;
export function generateRandomId(length: number): string;
export function generateRandomToken(): string;
```

#### `src/utils/logger.ts`
Unified logger (Cloudflare Workers compatible).

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  constructor(private level: LogLevel, private context?: Record<string, unknown>);

  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;

  child(context: Record<string, unknown>): Logger;
}
```

---

## Wrangler Configuration

```toml
name = "shipyard-signaling"
main = "src/index.ts"
compatibility_date = "2025-01-01"
account_id = "191909c2c1a28f6cb73d12e3362b874c"

# Durable Objects
[[durable_objects.bindings]]
name = "PERSONAL_ROOM"
class_name = "PersonalRoom"

[[durable_objects.bindings]]
name = "COLLAB_ROOM"
class_name = "CollabRoom"

# Migrations
[[migrations]]
tag = "v1"
new_sqlite_classes = ["PersonalRoom", "CollabRoom"]

# Development
[dev]
port = 4444
local_protocol = "http"

# Environment variables
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"

[env.development.vars]
ENVIRONMENT = "development"
LOG_LEVEL = "debug"

# Secrets (set via wrangler secret put):
# - GITHUB_CLIENT_ID
# - GITHUB_CLIENT_SECRET
# - JWT_SECRET
```

---

## API Endpoints Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | None | Health check |
| `/auth/github/callback` | POST | None | OAuth code → Shipyard JWT |
| `/collab/create` | POST | JWT | Generate pre-signed collab URL |
| `/personal/{userId}` | WS | JWT | Personal Room WebSocket |
| `/collab/{roomId}` | WS | Pre-signed | Collab Room WebSocket |

---

## Migration Notes

### From Current Signaling

1. **No platform adapter needed** - We're only targeting Cloudflare DO now
2. **No y-webrtc protocol** - loro-extended handles sync, we just relay WebRTC signaling
3. **No invite tokens** - Using pre-signed URLs for collab rooms (simpler)
4. **No epoch validation** - Loro handles versioning internally

### From OAuth Worker

1. **Same token exchange logic** - Just different endpoint path
2. **New JWT issuance** - Return Shipyard JWT instead of GitHub token
3. **Unified CORS** - Merge CORS config

### New Capabilities

1. **Personal Room** - Agent registry, browser↔daemon WebRTC
2. **Collab Room** - Multi-user WebRTC relay
3. **Shipyard JWT** - Centralized auth tokens
4. **Pre-signed URLs** - Time-limited collab access

---

## Open Implementation Questions

| Question | Notes |
|----------|-------|
| JWT library | jose? Custom? Workers Crypto API? |
| Room ID format | UUID? nanoid? Hash of user ID? |
| Pre-signed URL format | Query param? Path segment? |
| WebSocket subprotocol | Define one for versioning? |
| Agent ID format | Machine-scoped? Globally unique? |

---

*Last updated: 2026-01-31*
