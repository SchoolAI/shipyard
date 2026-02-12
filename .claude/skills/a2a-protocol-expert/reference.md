# A2A Protocol — Full Reference

## Agent Card Structure

```typescript
interface AgentCard {
  name: string;
  description: string;
  url: string;                          // Primary endpoint
  protocolVersion: string;              // "0.3.0"
  version: string;                      // Agent version
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  skills: AgentSkill[];
  defaultInputModes: string[];          // MIME types
  defaultOutputModes: string[];
  preferredTransport?: string;          // "JSONRPC" | "GRPC" | "HTTP+JSON"
  securitySchemes?: Record<string, SecurityScheme>;
  supportsAuthenticatedExtendedCard?: boolean;
  documentationUrl?: string;           // Link to agent docs
  iconUrl?: string;                    // Agent icon
  provider?: AgentProvider;            // { organization, url }
  additionalInterfaces?: AgentInterface[]; // Multi-transport
  security?: Record<string, string[]>[]; // Security requirements
  signatures?: AgentCardSignature[];   // JWS signatures
}
```

## JSON-RPC Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `message/send` | Send message, get response | `Task` or `Message` |
| `message/stream` | Send message, stream SSE | Events |
| `tasks/get` | Get task by ID | `Task` |
| `tasks/cancel` | Cancel task | `Task` |
| `tasks/resubscribe` | Re-subscribe to SSE | Events |
| `tasks/pushNotificationConfig/set` | Create push config | Config |
| `tasks/pushNotificationConfig/get` | Get push config | Config |
| `tasks/pushNotificationConfig/list` | List push configs | Config[] |
| `tasks/pushNotificationConfig/delete` | Delete push config | void |
| `agent/getAuthenticatedExtendedCard` | Get extended card | `AgentCard` |

## JS SDK — Server Classes

### AgentExecutor (you implement)
```typescript
interface AgentExecutor {
  execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void>;
  cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void>;
}
```

### RequestContext
```typescript
class RequestContext {
  readonly userMessage: Message;
  readonly taskId: string;
  readonly contextId: string;
  readonly task?: Task;              // Exists if continuing
  readonly referenceTasks?: Task[];
}
```

### ExecutionEventBus
```typescript
interface ExecutionEventBus {
  publish(event: Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent): void;
  finished(): void;
  on(eventName: 'event' | 'finished', listener: Function): this;
}
```

### DefaultRequestHandler
```typescript
new DefaultRequestHandler(
  agentCard, taskStore, agentExecutor,
  eventBusManager?, pushNotificationStore?, pushNotificationSender?, extendedAgentCard?
)
```

### TaskStore
```typescript
interface TaskStore {
  save(task: Task, context?: ServerCallContext): Promise<void>;
  load(taskId: string, context?: ServerCallContext): Promise<Task | undefined>;
}
// Built-in: InMemoryTaskStore
```

## JS SDK — Client Classes

### ClientFactory (recommended)
```typescript
const factory = new ClientFactory();
const client = await factory.createFromUrl("http://localhost:4000");
const client = await factory.createFromAgentCard(agentCard);
```

### Client Methods
```typescript
client.sendMessage(params, options?): Promise<Message | Task>
client.sendMessageStream(params, options?): AsyncGenerator<A2AStreamEventData>
client.getTask(params, options?): Promise<Task>
client.cancelTask(params, options?): Promise<Task>
client.resubscribeTask(params, options?): AsyncGenerator<A2AStreamEventData>
client.setTaskPushNotificationConfig(params, options?): Promise<PushNotificationConfig>
client.getTaskPushNotificationConfig(params, options?): Promise<PushNotificationConfig>
client.listTaskPushNotificationConfig(params, options?): Promise<PushNotificationConfig[]>
client.deleteTaskPushNotificationConfig(params, options?): Promise<void>
client.getAgentCard(options?): Promise<AgentCard>
```

### Express Integration
```typescript
import { A2AExpressApp, jsonRpcHandler, agentCardHandler, restHandler, UserBuilder } from "@a2a-js/sdk/server/express";

app.use("/.well-known/agent-card.json", agentCardHandler({ agentCardProvider: handler }));
app.use("/a2a/jsonrpc", jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));
app.use("/a2a/rest", restHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));
```

## Error Codes

| Code | Name |
|------|------|
| -32700 | JSONParseError |
| -32600 | InvalidRequestError |
| -32601 | MethodNotFoundError |
| -32602 | InvalidParamsError |
| -32001 | TaskNotFoundError |
| -32002 | TaskNotCancelableError |
| -32003 | PushNotificationNotSupportedError |
| -32004 | UnsupportedOperationError |
| -32005 | ContentTypeNotSupportedError |
| -32006 | InvalidAgentResponseError |
| -32007 | AuthenticatedExtendedCardNotConfiguredError |
| -32603 | InternalError |

## Import Paths

```typescript
import { AgentCard, Message, Task } from "@a2a-js/sdk";
import { ClientFactory, Client } from "@a2a-js/sdk/client";
import { AgentExecutor, DefaultRequestHandler } from "@a2a-js/sdk/server";
import { jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { grpcService } from "@a2a-js/sdk/server/grpc";
```
