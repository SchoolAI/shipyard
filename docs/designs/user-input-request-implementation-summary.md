# User Input Request Backend Service Layer - Implementation Summary

**Status:** ✅ Complete
**Date:** 2026-01-17
**Issue:** #72

## Overview

Implemented the core backend service layer for user input requests in Shipyard. This provides a blocking API that allows MCP tools and Hook API to request input from users via the browser UI.

## Files Created

### 1. `packages/schema/src/input-request.ts`

**Purpose:** Zod schema and TypeScript types for input requests

**Exports:**
- `InputRequestSchema` - Zod schema for validation
- `InputRequest` - TypeScript type
- `InputRequestType` - Union type: 'text' | 'multiline' | 'choice' | 'confirm'
- `InputRequestStatus` - Union type: 'pending' | 'answered' | 'cancelled'
- `CreateInputRequestParams` - Parameters for creating a request
- `createInputRequest()` - Helper function to create new requests with auto-generated fields

**Key Features:**
- Validates that 'choice' type includes options array
- Auto-generates ID using nanoid()
- Sets initial status to 'pending'
- Includes timeout support (0 = no timeout)

### 2. `packages/schema/src/yjs-keys.ts` (Updated)

**Changes:**
- Added `INPUT_REQUESTS: 'inputRequests'` constant to `YDOC_KEYS`
- Documented usage in MCP tools, server services, and browser UI

### 3. `apps/server/src/services/input-request-manager.ts`

**Purpose:** Core service for managing input requests in Y.Doc

**Class:** `InputRequestManager`

**Methods:**

1. **`createRequest(ydoc, params): string`**
   - Creates new input request in Y.Doc
   - Adds to INPUT_REQUESTS array
   - Returns generated request ID
   - Thread-safe using `ydoc.transact()`

2. **`waitForResponse(ydoc, requestId, timeoutSeconds?): Promise<InputRequestResponse>`**
   - **Blocking operation** - waits until answered/cancelled/timeout
   - Uses Y.Doc observer pattern (based on `waitForReviewDecision`)
   - Polls for status changes
   - Auto-cancels on timeout
   - Cleans up observers on completion
   - Returns structured response with success flag, response value, status, metadata

3. **`cancelRequest(ydoc, requestId): boolean`**
   - Marks pending request as cancelled
   - Updates status in Y.Doc atomically
   - Returns true if successfully cancelled
   - Returns false if request not found or not pending

4. **`getRequest(ydoc, requestId): InputRequest | undefined`**
   - Retrieves current request state
   - Validates with Zod schema before returning
   - Returns undefined if not found or invalid

5. **`getPendingRequests(ydoc): InputRequest[]`**
   - Lists all pending requests
   - Useful for UI to display active requests
   - Filters by status === 'pending'

6. **`cleanupOldRequests(ydoc, maxAgeMs): number`**
   - Removes old completed/cancelled requests
   - Prevents unbounded growth
   - Keeps pending requests regardless of age
   - Default: 24 hours
   - Returns count of removed requests

**Response Type:**
```typescript
interface InputRequestResponse {
  success: boolean;
  response?: unknown;
  status: 'answered' | 'cancelled';
  answeredBy?: string;
  answeredAt?: number;
  reason?: string; // Cancellation reason if applicable
}
```

## Testing

Created comprehensive test suite: `apps/server/src/services/input-request-manager.test.ts`

**Coverage:**
- ✅ Creating requests (all types)
- ✅ Getting request state
- ✅ Cancelling requests
- ✅ Waiting for responses (immediate and delayed)
- ✅ Timeout handling (fake timers)
- ✅ Request not found scenarios
- ✅ Listing pending requests
- ✅ Cleanup of old requests
- ✅ Full request lifecycle integration

**Test Results:** 24/24 passing

## Design Patterns

### 1. Blocking Observer Pattern

Based on `apps/hook/src/core/review-status.ts:waitForReviewDecision()`:
- Creates Y.Doc observer
- Polls for status changes
- Uses Promise wrapper for async/await interface
- Cleans up on completion or timeout

### 2. Thread-Safe Y.Doc Transactions

All writes wrapped in `ydoc.transact(() => { ... })`:
- Atomic read-modify-write operations
- Prevents race conditions
- Follows existing Y.Doc patterns

### 3. Timeout Handling

- Configurable timeout per request
- Auto-cancels after timeout expires
- Updates Y.Doc status atomically
- Clears timeout handlers on cleanup

## Integration Points

### For MCP Tools (Agent 2)
```typescript
import { InputRequestManager } from './services/input-request-manager.js';

const manager = new InputRequestManager();

// Create request
const requestId = manager.createRequest(ydoc, {
  message: 'Enter filename:',
  type: 'text',
  defaultValue: 'output.txt',
  timeout: 60 // seconds
});

// Block until user responds
const response = await manager.waitForResponse(ydoc, requestId);

if (response.success) {
  console.log('User entered:', response.response);
} else {
  console.log('Cancelled:', response.reason);
}
```

### For Hook API (Agent 3)
```typescript
// Similar usage but accessed through hook session state
const manager = new InputRequestManager();
const requestId = manager.createRequest(sessionYdoc, params);
const response = await manager.waitForResponse(sessionYdoc, requestId);
```

### For Browser UI (Future)
```typescript
// Read from Y.Doc INPUT_REQUESTS array
const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);

// Display pending requests
const pending = requestsArray.toJSON().filter(r => r.status === 'pending');

// User responds
ydoc.transact(() => {
  requestsArray.delete(index, 1);
  requestsArray.insert(index, [{
    ...request,
    status: 'answered',
    response: userInput,
    answeredAt: Date.now(),
    answeredBy: currentUser
  }]);
});
```

## Architecture Notes

### Y.Doc Storage Structure

Input requests stored in `Y.Array<InputRequest>` at key `inputRequests`:
```typescript
{
  id: "abc123",
  createdAt: 1737088800000,
  message: "What is your name?",
  type: "text",
  status: "pending",
  timeout: 30
}
```

After user responds:
```typescript
{
  id: "abc123",
  createdAt: 1737088800000,
  message: "What is your name?",
  type: "text",
  status: "answered",
  response: "John Doe",
  answeredAt: 1737088830000,
  answeredBy: "john"
}
```

### Concurrency

- Multiple requests can be pending simultaneously
- Each request identified by unique ID
- Observer only resolves for matching request ID
- Thread-safe Y.Doc transactions prevent race conditions

### Cleanup Strategy

- Requests accumulate in Y.Doc over time
- Periodic cleanup recommended (via cron or on-demand)
- Default: Remove completed/cancelled requests >24 hours old
- Pending requests never auto-removed

## Validation

✅ Schema package builds successfully
✅ Server package builds successfully
✅ All 24 tests passing
✅ No breaking changes to existing code
✅ Follows engineering standards (Zod, functional programming, pino logging)

## Next Steps

### Agent 2: MCP Tool Implementation
- Create `apps/server/src/tools/request-user-input.ts`
- Integrate with InputRequestManager
- Add to tool registry

### Agent 3: Hook API Implementation
- Add endpoint to Hook API for requesting input
- Integrate with InputRequestManager
- Document for Claude Code hook usage

### Browser UI (Future)
- Create InputRequestDialog component
- Display pending requests
- Handle user responses
- Show request history

## References

- **Design Doc:** `docs/designs/user-input-request-research.md`
- **Pattern Reference:** `apps/hook/src/core/review-status.ts:waitForReviewDecision()`
- **Schema Patterns:** `packages/schema/src/plan.ts`
- **Y.Doc Patterns:** `apps/server/src/doc-store.ts`

---

**Implementation Time:** ~2 hours
**Lines of Code:** ~500 (including tests)
**Test Coverage:** Comprehensive (24 tests)
