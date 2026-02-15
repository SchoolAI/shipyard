# MCP Protocol — Full Reference

## Initialization

### InitializeRequest (Client → Server)

```typescript
interface InitializeRequestParams {
  protocolVersion: string;        // "2025-11-25"
  capabilities: ClientCapabilities;
  clientInfo: Implementation;     // { name, version, title?, description?, icons? }
}
```

### InitializeResult (Server → Client)

```typescript
interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: Implementation;
  instructions?: string;          // Hint for LLM about server usage
}
```

### Client Capabilities

```typescript
interface ClientCapabilities {
  experimental?: { [key: string]: object };
  roots?: { listChanged?: boolean };
  sampling?: { context?: object; tools?: object };
  elicitation?: { form?: object; url?: object };
  tasks?: {
    list?: object;
    cancel?: object;
    requests?: {
      sampling?: { createMessage?: object };
      elicitation?: { create?: object };
    };
  };
}
```

### Server Capabilities

```typescript
interface ServerCapabilities {
  experimental?: { [key: string]: object };
  logging?: object;
  completions?: object;
  prompts?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  tools?: { listChanged?: boolean };
  tasks?: {
    list?: object;
    cancel?: object;
    requests?: { tools?: { call?: object } };
  };
}
```

## Tools

### Tool Definition

```typescript
interface Tool {
  name: string;                    // Unique, 1-128 chars, [A-Za-z0-9_\-.]
  title?: string;                  // Human-readable display name
  description?: string;
  icons?: Icon[];
  inputSchema: {                   // JSON Schema (defaults to 2020-12)
    type: "object";
    properties?: { [key: string]: object };
    required?: string[];
  };
  outputSchema?: {                 // Optional structured output schema
    type: "object";
    properties?: { [key: string]: object };
    required?: string[];
  };
  execution?: {
    taskSupport?: "forbidden" | "optional" | "required";
  };
  annotations?: ToolAnnotations;
}

interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;          // default: false
  destructiveHint?: boolean;       // default: true (when readOnly=false)
  idempotentHint?: boolean;        // default: false
  openWorldHint?: boolean;         // default: true
}
```

### Methods

| Method | Direction | Params | Result |
|--------|-----------|--------|--------|
| `tools/list` | Client → Server | `{ cursor? }` | `{ tools: Tool[], nextCursor? }` |
| `tools/call` | Client → Server | `{ name, arguments?, task? }` | `CallToolResult` or `CreateTaskResult` |
| `notifications/tools/list_changed` | Server → Client | — | — |

### CallToolResult

```typescript
interface CallToolResult {
  content: ContentBlock[];           // Unstructured result
  structuredContent?: object;        // Structured result (if outputSchema defined)
  isError?: boolean;                 // true = tool execution error
}
```

## Resources

### Resource Definition

```typescript
interface Resource {
  uri: string;                       // @format uri
  name: string;
  title?: string;
  description?: string;
  icons?: Icon[];
  mimeType?: string;
  size?: number;                     // bytes, before encoding
  annotations?: Annotations;
}

interface ResourceTemplate {
  uriTemplate: string;               // RFC 6570 URI template
  name: string;
  title?: string;
  description?: string;
  icons?: Icon[];
  mimeType?: string;
  annotations?: Annotations;
}
```

### Methods

| Method | Direction | Params | Result |
|--------|-----------|--------|--------|
| `resources/list` | Client → Server | `{ cursor? }` | `{ resources: Resource[], nextCursor? }` |
| `resources/templates/list` | Client → Server | `{ cursor? }` | `{ resourceTemplates: ResourceTemplate[] }` |
| `resources/read` | Client → Server | `{ uri }` | `{ contents: (TextResourceContents \| BlobResourceContents)[] }` |
| `resources/subscribe` | Client → Server | `{ uri }` | `EmptyResult` |
| `resources/unsubscribe` | Client → Server | `{ uri }` | `EmptyResult` |
| `notifications/resources/list_changed` | Server → Client | — | — |
| `notifications/resources/updated` | Server → Client | `{ uri }` | — |

### Resource Contents

```typescript
interface TextResourceContents { uri: string; mimeType?: string; text: string; }
interface BlobResourceContents { uri: string; mimeType?: string; blob: string; } // base64
```

### Common URI Schemes

- `https://` — Web-fetchable by client directly
- `file://` — Filesystem-like (may be virtual)
- `git://` — Git integration
- Custom schemes per RFC 3986

## Prompts

### Prompt Definition

```typescript
interface Prompt {
  name: string;
  title?: string;
  description?: string;
  icons?: Icon[];
  arguments?: PromptArgument[];
}

interface PromptArgument {
  name: string;
  title?: string;
  description?: string;
  required?: boolean;
}
```

### Methods

| Method | Direction | Params | Result |
|--------|-----------|--------|--------|
| `prompts/list` | Client → Server | `{ cursor? }` | `{ prompts: Prompt[], nextCursor? }` |
| `prompts/get` | Client → Server | `{ name, arguments? }` | `{ description?, messages: PromptMessage[] }` |
| `notifications/prompts/list_changed` | Server → Client | — | — |

### PromptMessage

```typescript
interface PromptMessage {
  role: "user" | "assistant";
  content: TextContent | ImageContent | AudioContent | ResourceLink | EmbeddedResource;
}
```

## Sampling (Server → Client)

### CreateMessageRequest

```typescript
interface CreateMessageRequestParams {
  messages: SamplingMessage[];
  modelPreferences?: ModelPreferences;
  systemPrompt?: string;
  includeContext?: "none" | "thisServer" | "allServers"; // soft-deprecated
  temperature?: number;
  maxTokens: number;
  stopSequences?: string[];
  metadata?: object;
  tools?: Tool[];                     // Requires sampling.tools capability
  toolChoice?: { mode?: "auto" | "required" | "none" };
  task?: TaskMetadata;
}

interface SamplingMessage {
  role: "user" | "assistant";
  content: SamplingMessageContentBlock | SamplingMessageContentBlock[];
}

type SamplingMessageContentBlock =
  | TextContent | ImageContent | AudioContent
  | ToolUseContent | ToolResultContent;
```

### CreateMessageResult

```typescript
interface CreateMessageResult {
  role: "assistant";
  content: SamplingMessageContentBlock | SamplingMessageContentBlock[];
  model: string;
  stopReason?: "endTurn" | "stopSequence" | "maxTokens" | "toolUse" | string;
}
```

### Model Preferences

```typescript
interface ModelPreferences {
  hints?: ModelHint[];              // Substring-matched model names
  costPriority?: number;            // 0-1
  speedPriority?: number;           // 0-1
  intelligencePriority?: number;    // 0-1
}
```

## Elicitation (Server → Client)

### Form Mode

```typescript
interface ElicitRequestFormParams {
  mode?: "form";                     // default if omitted
  message: string;
  requestedSchema: {
    type: "object";
    properties: { [key: string]: PrimitiveSchemaDefinition };
    required?: string[];
  };
}

type PrimitiveSchemaDefinition =
  | StringSchema    // { type: "string", format?: "email"|"uri"|"date"|"date-time", ... }
  | NumberSchema    // { type: "number"|"integer", minimum?, maximum?, ... }
  | BooleanSchema   // { type: "boolean", ... }
  | EnumSchema;     // Single-select or multi-select
```

### URL Mode

```typescript
interface ElicitRequestURLParams {
  mode: "url";
  message: string;
  elicitationId: string;
  url: string;                       // @format uri
}
```

### ElicitResult

```typescript
interface ElicitResult {
  action: "accept" | "decline" | "cancel";
  content?: { [key: string]: string | number | boolean | string[] };
}
```

## Roots (Server → Client)

| Method | Params | Result |
|--------|--------|--------|
| `roots/list` | — | `{ roots: Root[] }` |
| `notifications/roots/list_changed` | Client → Server | — |

```typescript
interface Root { uri: string; name?: string; }  // uri must start with file://
```

## Tasks (Experimental)

### Task Status Lifecycle

```
working → input_required | completed | failed | cancelled
input_required → working | completed | failed | cancelled
completed / failed / cancelled → (terminal, no transitions)
```

### Methods

| Method | Direction | Params | Result |
|--------|-----------|--------|--------|
| `tasks/get` | Requestor → Receiver | `{ taskId }` | `Task` |
| `tasks/result` | Requestor → Receiver | `{ taskId }` | Original result type |
| `tasks/cancel` | Requestor → Receiver | `{ taskId }` | `Task` |
| `tasks/list` | Requestor → Receiver | `{ cursor? }` | `{ tasks: Task[], nextCursor? }` |
| `notifications/tasks/status` | Receiver → Requestor | `Task` | — |

### Task Object

```typescript
interface Task {
  taskId: string;
  status: "working" | "input_required" | "completed" | "failed" | "cancelled";
  statusMessage?: string;
  createdAt: string;                 // ISO 8601
  lastUpdatedAt: string;
  ttl: number | null;                // ms from creation, null = unlimited
  pollInterval?: number;             // suggested ms between polls
}
```

### Related Task Metadata

All task-associated messages include:
```json
{ "_meta": { "io.modelcontextprotocol/related-task": { "taskId": "..." } } }
```

## Utilities

### Ping

| Method | Direction | Result |
|--------|-----------|--------|
| `ping` | Either → Either | `EmptyResult` |

### Progress

```typescript
interface ProgressNotificationParams {
  progressToken: ProgressToken;      // From original request's _meta
  progress: number;
  total?: number;
  message?: string;
}
// notifications/progress (either direction)
```

### Cancellation

```typescript
interface CancelledNotificationParams {
  requestId?: RequestId;             // Required for non-task cancellation
  reason?: string;
}
// notifications/cancelled (either direction)
```

### Logging (Server → Client)

```typescript
interface LoggingMessageNotificationParams {
  level: LoggingLevel;               // debug|info|notice|warning|error|critical|alert|emergency
  logger?: string;
  data: unknown;
}
// logging/setLevel (Client → Server): { level: LoggingLevel }
// notifications/message (Server → Client)
```

### Completions

```typescript
interface CompleteRequestParams {
  ref: PromptReference | ResourceTemplateReference;
  argument: { name: string; value: string };
  context?: { arguments?: { [key: string]: string } };
}
// completion/complete → { completion: { values: string[], total?, hasMore? } }
```

## Transports Detail

### stdio

- Client launches server as subprocess
- JSON-RPC messages on stdin (client→server) and stdout (server→client)
- Newline-delimited, no embedded newlines
- stderr for logging (informational, not errors)

### Streamable HTTP

- Single MCP endpoint for POST and GET
- POST: Client sends JSON-RPC request/notification/response
  - Response: `application/json` (single) or `text/event-stream` (SSE stream)
- GET: Client opens SSE stream for server-initiated messages
- Session: `MCP-Session-Id` header (server assigns at init)
- Version: `MCP-Protocol-Version: 2025-11-25` header on all requests
- Security: Validate `Origin` header, bind to localhost for local servers
- Resumability: SSE event IDs + `Last-Event-ID` header for reconnection

## Content Types

### Annotations (shared across content)

```typescript
interface Annotations {
  audience?: ("user" | "assistant")[];
  priority?: number;                 // 0.0 (optional) to 1.0 (required)
  lastModified?: string;             // ISO 8601
}
```

### Icon

```typescript
interface Icon {
  src: string;                       // URI or data: URI
  mimeType?: string;                 // Required: image/png, image/jpeg. Recommended: image/svg+xml, image/webp
  sizes?: string[];                  // "48x48", "any" for SVG
  theme?: "light" | "dark";
}
```

## Error Codes (Complete)

| Code | Name | Usage |
|------|------|-------|
| -32700 | ParseError | Malformed JSON |
| -32600 | InvalidRequest | Invalid JSON-RPC |
| -32601 | MethodNotFound | Unknown method |
| -32602 | InvalidParams | Bad params, unknown tool, missing args, invalid taskId |
| -32603 | InternalError | Server/client internal error |
| -32042 | URLElicitationRequired | Server needs URL elicitation before proceeding |
| -32002 | (Resource not found) | Resource URI not found |
| -1 | (User rejected) | User rejected sampling request |
