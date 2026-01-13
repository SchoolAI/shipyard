# Implementation Plan: Context Teleportation (Issue #41)

**Goal:** Enable human-initiated conversation export/import between different AI agent platforms (Claude Code ↔ Devin ↔ Cursor, etc.) using A2A Message[] as intermediate format and P2P WebRTC as the delivery mechanism.

---

## Core Architecture

### The "Foreign Key" Pattern

When creating a plan, capture the origin platform's session identifier:

```typescript
// PlanMetadata additions
interface PlanMetadata {
  // ... existing fields

  // NEW: Origin tracking for conversation export
  originPlatform: 'claude-code' | 'devin' | 'cursor' | 'windsurf' | 'unknown';
  originSessionId: string;           // Platform-specific session ID
  originTranscriptPath?: string;     // For file-based platforms (Claude Code)
  originCwd?: string;                // Working directory context
}
```

### The P2P Message Bus Pattern

**Key insight:** Full conversation transcripts are **ephemeral** - transmitted once via WebRTC, NOT stored in Y.Doc.

```
Claude Browser                          Devin Browser
      |                                       |
      | 1. Human: "Export for Devin"          |
      | 2. Read originSessionId from metadata |
      | 3. Load ~/.claude/.../session.jsonl  |
      | 4. Convert JSONL → A2A Message[]      |
      | 5. Compress with lz-string            |
      |                                       |
      |-------- WebRTC Data Channel -------->|
      |        (custom message type 0xF3)     |
      |                                       | 6. Decompress
      |                                       | 7. A2A → Devin format
      |                                       | 8. Import to Devin session
```

**Why NOT store in Y.Doc:**
- Full sessions could be MB-scale (100+ messages with tool results)
- Would bloat CRDT sync
- Only needed for one-time handoff
- P2P already connected - use data channel directly

---

## Implementation Phases

### Phase 1: Capture Origin Session Metadata

**Scope:** Store foreign session ID when plan created

#### 1a: Schema Updates

**Files:**
- `packages/schema/src/plan.ts`

**Changes:**
```typescript
export const PlanMetadataSchema = z.object({
  // ... existing fields

  // Origin tracking for conversation export
  originPlatform: z.enum(['claude-code', 'devin', 'cursor', 'windsurf', 'aider', 'unknown']).optional(),
  originSessionId: z.string().optional(),
  originTranscriptPath: z.string().optional(),
  originCwd: z.string().optional(),
  originMetadata: z.record(z.unknown()).optional(),  // Platform-specific extras
});
```

#### 1b: Hook Integration (Claude Code)

**Files:**
- `apps/hook/src/adapters/claude-code.ts`
- `apps/hook/src/core/plan-manager.ts`

**Changes:**
Hook already receives `session_id` and `transcript_path` via stdin:

```typescript
// In handleCreateSession or plan_exit event
const hookInput = JSON.parse(stdin);

// Pass to createSession
await createSession({
  sessionId: hookInput.session_id,
  agentType: 'claude-code',
  metadata: {
    originSessionId: hookInput.session_id,
    originTranscriptPath: hookInput.transcript_path,
    originCwd: hookInput.cwd,
  },
});
```

**Server side** (`apps/server/src/hook-api.ts`):
```typescript
export async function handleCreateSession(req: Request, res: Response) {
  const input = CreateHookSessionRequestSchema.parse(req.body);

  initPlanMetadata(ydoc, {
    // ... existing fields
    originPlatform: 'claude-code',
    originSessionId: input.sessionId,
    originTranscriptPath: input.metadata?.originTranscriptPath,
    originCwd: input.metadata?.originCwd,
  });
}
```

#### 1c: MCP Tool Integration (Other Platforms)

**Files:**
- `apps/server/src/tools/create-plan.ts`

**Changes:**
Add optional parameters to `create_plan` tool:

```typescript
const CreatePlanInput = z.object({
  title: z.string(),
  content: z.string(),
  repo: z.string().optional(),
  prNumber: z.number().optional(),

  // NEW: Origin tracking
  originPlatform: z.enum(['devin', 'cursor', 'windsurf', 'aider', 'unknown']).optional(),
  originSessionId: z.string().optional(),
  originMetadata: z.record(z.unknown()).optional(),
});
```

**Tool description update:**
```
If you know your platform-specific session ID, include it via originSessionId
parameter so conversation history can be exported later.

Examples:
- Devin: Pass session ID from Devin API
- Cursor: Pass composer ID if available
- Unknown: Leave blank, export will be limited to plan content only
```

**Deliverables:**
- [ ] Update PlanMetadata schema with origin fields {#deliverable}
- [ ] Hook captures session_id and transcript_path {#deliverable}
- [ ] MCP tool accepts optional origin parameters {#deliverable}
- [ ] Test: Create plan from hook, verify originSessionId stored {#deliverable}

---

### Phase 2: Claude Code Transcript → A2A Converter

**Scope:** Read JSONL, convert to A2A Message[] format

#### 2a: Transcript Parser

**Files:**
- `packages/schema/src/conversation-export.ts` (new)

**Implementation:**
```typescript
import { readFileSync } from 'node:fs';
import { z } from 'zod';

// Claude Code JSONL message schema
const ClaudeCodeMessageSchema = z.object({
  sessionId: z.string(),
  type: z.enum(['user', 'assistant', 'summary']),
  message: z.object({
    role: z.string(),
    content: z.array(z.unknown()),
  }),
  uuid: z.string(),
  timestamp: z.string(),
  parentUuid: z.string().optional(),
});

export function parseClaudeCodeTranscript(transcriptPath: string): ClaudeCodeMessage[] {
  const lines = readFileSync(transcriptPath, 'utf-8').split('\n');

  return lines
    .filter(line => line.trim())
    .map(line => {
      const parsed = JSON.parse(line);
      return ClaudeCodeMessageSchema.parse(parsed);
    });
}
```

#### 2b: A2A Message Converter

**Files:**
- `packages/schema/src/conversation-export.ts`

**Implementation:**
```typescript
// A2A Message schema
const A2AMessageSchema = z.object({
  messageId: z.string(),
  role: z.enum(['user', 'agent']),
  parts: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({ type: z.literal('data'), data: z.any() }),
    z.object({
      type: z.literal('file'),
      uri: z.string(),
      mediaType: z.string().optional(),
      name: z.string().optional()
    }),
  ])),
  contextId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export function claudeCodeToA2A(
  messages: ClaudeCodeMessage[],
  contextId: string
): A2AMessage[] {
  return messages
    .filter(msg => msg.type !== 'summary')  // Skip summaries
    .map(msg => {
      const role = msg.message.role === 'user' ? 'user' : 'agent';

      // Convert content blocks to A2A parts
      const parts: A2APart[] = [];

      for (const block of msg.message.content) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          // Store tool use as data part
          parts.push({
            type: 'data',
            data: {
              toolUse: {
                name: block.name,
                id: block.id,
                input: block.input
              }
            }
          });
        } else if (block.type === 'tool_result') {
          // Include full tool results for now (Option A)
          parts.push({
            type: 'data',
            data: {
              toolResult: {
                toolUseId: block.tool_use_id,
                content: block.content,
                isError: block.is_error
              }
            }
          });
        }
      }

      return {
        messageId: msg.uuid,
        role,
        parts,
        contextId,
        metadata: {
          timestamp: msg.timestamp,
          platform: 'claude-code',
          parentMessageId: msg.parentUuid,
        }
      };
    });
}
```

**Deliverables:**
- [ ] Transcript parser for Claude Code JSONL format {#deliverable}
- [ ] A2A message converter with full tool results {#deliverable}
- [ ] Unit tests for round-trip conversion {#deliverable}
- [ ] Handle thinking blocks in metadata {#deliverable}

---

### Phase 3: WebRTC Data Channel for Large Transfers

**Scope:** Send compressed conversation blob via P2P without storing in Y.Doc

#### 3a: Custom Message Protocol

**Files:**
- `packages/schema/src/p2p-messages.ts` (new)

**Message types:**
```typescript
// Custom message type bytes (won't conflict with Yjs 0x00-0x04)
enum P2PMessageType {
  CONVERSATION_EXPORT_START = 0xF0,  // Start transfer, includes metadata
  CONVERSATION_CHUNK       = 0xF1,   // Data chunk
  CONVERSATION_EXPORT_END  = 0xF2,   // End transfer, includes checksum
}

interface ConversationExportMeta {
  exportId: string;           // UUID for this transfer
  totalChunks: number;        // Number of chunks to expect
  totalBytes: number;         // Uncompressed size
  compressedBytes: number;    // Compressed size
  sourcePlatform: string;     // 'claude-code'
  sourceSessionId: string;    // Origin session
  planId: string;             // Which plan this is for
  exportedAt: number;         // Timestamp
}

interface ChunkMessage {
  exportId: string;
  chunkIndex: number;
  data: Uint8Array;
}
```

#### 3b: File Transfer Manager

**Files:**
- `apps/web/src/utils/p2p-file-transfer.ts` (new)

Based on research, implement chunked transfer with backpressure handling:

```typescript
import lzstring from 'lz-string';

const CHUNK_SIZE = 16 * 1024; // 16 KiB (safe cross-browser)

export class ConversationTransferManager {
  private peers: Map<string, SimplePeer.Instance>;

  constructor(webrtcProvider: WebrtcProvider) {
    // Access internal simple-peer connections
    this.peers = (webrtcProvider as any).room?.webrtcConns || new Map();
  }

  /**
   * Send conversation export to a specific peer.
   */
  async sendConversationExport(
    peerId: string,
    a2aMessages: A2AMessage[],
    metadata: ConversationExportMeta
  ): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error(`Peer ${peerId} not connected`);

    // Compress
    const json = JSON.stringify(a2aMessages);
    const compressed = lzstring.compressToUint8Array(json);

    // Chunk
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
      chunks.push(compressed.slice(i, i + CHUNK_SIZE));
    }

    // Send start message
    const startMsg = new Uint8Array(1 + JSON.stringify(metadata).length);
    startMsg[0] = P2PMessageType.CONVERSATION_EXPORT_START;
    // ... encode metadata

    await this.sendWithBackpressure(peer, startMsg);

    // Send chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkMsg = new Uint8Array(1 + 4 + chunks[i].length);
      chunkMsg[0] = P2PMessageType.CONVERSATION_CHUNK;
      // ... encode chunk index and data

      await this.sendWithBackpressure(peer, chunkMsg);

      // Progress callback
      this.onProgress?.(i + 1, chunks.length);
    }

    // Send end message with checksum
    const endMsg = new Uint8Array(1 + 32); // Type byte + SHA256
    endMsg[0] = P2PMessageType.CONVERSATION_EXPORT_END;
    // ... include checksum

    await this.sendWithBackpressure(peer, endMsg);
  }

  /**
   * Send with backpressure handling.
   */
  private async sendWithBackpressure(
    peer: SimplePeer.Instance,
    data: Uint8Array
  ): Promise<void> {
    // Wait if buffer is full
    while (peer.bufferedAmount > 1024 * 1024) { // 1 MB threshold
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    peer.send(data);
  }

  /**
   * Receive conversation export from peer.
   */
  onReceiveConversation(
    callback: (a2aMessages: A2AMessage[], metadata: ConversationExportMeta) => void
  ): void {
    const chunks = new Map<string, Uint8Array[]>();
    const metadataMap = new Map<string, ConversationExportMeta>();

    for (const [peerId, peer] of this.peers) {
      peer.on('data', (data: Uint8Array) => {
        const type = data[0];

        if (type === P2PMessageType.CONVERSATION_EXPORT_START) {
          // Parse metadata
          const metadata = JSON.parse(decoder.decode(data.slice(1)));
          metadataMap.set(metadata.exportId, metadata);
          chunks.set(metadata.exportId, []);
        }
        else if (type === P2PMessageType.CONVERSATION_CHUNK) {
          // Store chunk
          const exportId = /* decode */;
          const chunkIndex = /* decode */;
          const chunkData = data.slice(/* offset */);

          chunks.get(exportId)![chunkIndex] = chunkData;
        }
        else if (type === P2PMessageType.CONVERSATION_EXPORT_END) {
          // Reassemble and verify
          const exportId = /* decode */;
          const receivedChunks = chunks.get(exportId)!;
          const metadata = metadataMap.get(exportId)!;

          // Concatenate chunks
          const compressed = new Uint8Array(metadata.compressedBytes);
          let offset = 0;
          for (const chunk of receivedChunks) {
            compressed.set(chunk, offset);
            offset += chunk.length;
          }

          // Decompress
          const json = lzstring.decompressFromUint8Array(compressed);
          const a2aMessages = JSON.parse(json);

          // Verify checksum
          // ...

          callback(a2aMessages, metadata);

          // Cleanup
          chunks.delete(exportId);
          metadataMap.delete(exportId);
        }
      });
    }
  }
}
```

**Deliverables:**
- [ ] P2P message type constants and schemas {#deliverable}
- [ ] ConversationTransferManager with chunked transfer {#deliverable}
- [ ] Backpressure handling to prevent buffer overflow {#deliverable}
- [ ] Checksum verification for data integrity {#deliverable}

---

### Phase 4: Export UI & Workflow

**Scope:** UI for initiating conversation export and import

#### 4a: Export Dialog

**Files:**
- `apps/web/src/components/ExportConversationDialog.tsx` (new)

**UI Flow:**
```
1. User clicks "Export Conversation" in plan menu
2. Dialog shows:
   - Connected peers list (who can receive)
   - Or fallback: "Download as file" if no peers
3. User selects peer (e.g., "Devin Browser - 192.168.1.10")
4. Progress bar shows transfer (chunking)
5. Success: "Conversation sent to Devin!"
```

**Implementation:**
```typescript
function ExportConversationDialog({ planId, onClose }) {
  const { connectedPeers } = useP2PPeers();
  const { exportConversation } = useConversationExport();
  const [progress, setProgress] = useState(0);

  async function handleExport(peerId: string) {
    await exportConversation(planId, peerId, {
      onProgress: (current, total) => {
        setProgress((current / total) * 100);
      }
    });

    toast.success('Conversation sent!');
    onClose();
  }

  return (
    <Dialog>
      <h2>Export Conversation</h2>
      {connectedPeers.length > 0 ? (
        <PeerList>
          {connectedPeers.map(peer => (
            <PeerCard key={peer.id} onClick={() => handleExport(peer.id)}>
              {peer.platform} - {peer.name}
            </PeerCard>
          ))}
        </PeerList>
      ) : (
        <FallbackExport planId={planId} />
      )}
    </Dialog>
  );
}
```

#### 4b: Import Handler

**Files:**
- `apps/web/src/hooks/useConversationImport.ts` (new)

**Implementation:**
```typescript
export function useConversationImport(planId: string) {
  const transferManager = useRef<ConversationTransferManager>();

  useEffect(() => {
    if (!transferManager.current) return;

    transferManager.current.onReceiveConversation((a2aMessages, metadata) => {
      // Show notification
      toast.info(`Received conversation from ${metadata.sourcePlatform}`, {
        action: {
          label: 'Import',
          onClick: () => handleImport(a2aMessages, metadata)
        }
      });
    });
  }, []);

  async function handleImport(
    a2aMessages: A2AMessage[],
    metadata: ConversationExportMeta
  ) {
    // Option A: Store in plan metadata (just reference)
    // Option B: Display in modal for user to review
    // Option C: Automatically create new plan with imported context

    // For now: Show in dialog
    setImportedConversation({ messages: a2aMessages, metadata });
  }

  return { importedConversation };
}
```

#### 4c: Fallback: File-Based Transfer

**When P2P not available** (no connected peers):

```typescript
function FallbackExport({ planId }: { planId: string }) {
  async function downloadExport() {
    const blob = await exportConversationToBlob(planId);

    // Download as file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${planId}.a2a.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p>No peers connected. Download export file and share manually.</p>
      <Button onClick={downloadExport}>Download Export</Button>
    </div>
  );
}

function ImportFromFile() {
  async function handleFile(file: File) {
    const json = await file.text();
    const a2aMessages = JSON.parse(json);

    // Import conversation
    await importConversation(a2aMessages);
  }

  return <FileInput accept=".a2a.json" onChange={handleFile} />;
}
```

**Deliverables:**
- [ ] ExportConversationDialog with peer selection {#deliverable}
- [ ] Import handler with toast notifications {#deliverable}
- [ ] Fallback file download/upload for offline {#deliverable}
- [ ] Progress UI for chunked transfers {#deliverable}

---

### Phase 5: MCP Tools for Programmatic Access

**Scope:** `export_conversation` and `import_conversation` MCP tools

#### 5a: export_conversation Tool

**Files:**
- `apps/server/src/tools/export-conversation.ts` (new)

**Implementation:**
```typescript
export const exportConversationTool = {
  definition: {
    name: 'export_conversation',
    description: 'Export full conversation transcript in A2A format for handoff to another agent platform',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID to export conversation for' },
        targetPlatform: {
          type: 'string',
          enum: ['devin', 'cursor', 'windsurf', 'a2a-generic'],
          description: 'Target platform (for format optimization)'
        }
      },
      required: ['planId']
    }
  },

  handler: async (args) => {
    const { planId, targetPlatform } = args;

    // 1. Get plan metadata to find originTranscriptPath
    const ydoc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata.originTranscriptPath) {
      throw new Error('No origin transcript path - cannot export conversation');
    }

    if (metadata.originPlatform !== 'claude-code') {
      throw new Error(`Export from ${metadata.originPlatform} not yet supported`);
    }

    // 2. Read full Claude Code transcript
    const messages = parseClaudeCodeTranscript(metadata.originTranscriptPath);

    // 3. Convert to A2A
    const a2aMessages = claudeCodeToA2A(messages, planId);

    // 4. Compress
    const json = JSON.stringify(a2aMessages);
    const compressed = lzstring.compress(json);

    // 5. Return base64 (for clipboard/file)
    const base64 = Buffer.from(compressed).toString('base64');

    return {
      content: [{
        type: 'text',
        text: `Conversation exported successfully!

Messages: ${a2aMessages.length}
Size: ${json.length} bytes (${compressed.length} bytes compressed)
Format: A2A Message[]

To import in another agent:
1. Copy the base64 blob below
2. In target platform, call: import_conversation(blob)

Base64 blob:
${base64}`
      }]
    };
  }
};
```

#### 5b: import_conversation Tool

**Files:**
- `apps/server/src/tools/import-conversation.ts` (new)

**Implementation:**
```typescript
export const importConversationTool = {
  definition: {
    name: 'import_conversation',
    description: 'Import conversation from another agent platform (A2A format)',
    inputSchema: {
      type: 'object',
      properties: {
        blob: {
          type: 'string',
          description: 'Base64-encoded compressed A2A Message[] array'
        },
        createNewPlan: {
          type: 'boolean',
          description: 'Create new plan vs attach to existing (default: true)'
        },
        targetPlanId: {
          type: 'string',
          description: 'Plan ID to attach to (if createNewPlan: false)'
        }
      },
      required: ['blob']
    }
  },

  handler: async (args) => {
    const { blob, createNewPlan = true, targetPlanId } = args;

    // 1. Decode and decompress
    const compressed = Buffer.from(blob, 'base64');
    const json = lzstring.decompress(compressed.toString());
    const a2aMessages: A2AMessage[] = JSON.parse(json);

    // 2. Extract conversation summary for plan title/content
    const summary = summarizeConversation(a2aMessages);

    if (createNewPlan) {
      // 3a. Create new plan with conversation context
      const planId = nanoid();
      const ydoc = await getOrCreateDoc(planId);

      initPlanMetadata(ydoc, {
        id: planId,
        title: summary.title || 'Imported Conversation',
        status: 'draft',
        ownerId: getGitHubUsername(),
        // Store origin metadata
        originPlatform: a2aMessages[0]?.metadata?.platform || 'unknown',
        originSessionId: a2aMessages[0]?.contextId,
      });

      // Store conversation in... where?
      // Option: Add to plan content as "Context" section
      // Option: Store in metadata.importedConversation (too large?)
      // Option: Just provide summary, full context available on demand

      const url = `http://localhost:5173/plan/${planId}`;
      await open(url);

      return {
        content: [{
          type: 'text',
          text: `Conversation imported!

New plan created: ${planId}
Messages imported: ${a2aMessages.length}
URL: ${url}

Summary:
${summary.text}`
        }]
      };
    } else {
      // 3b. Attach to existing plan (add as context annotation)
      // ... implementation
    }
  }
};
```

**Deliverables:**
- [ ] export_conversation MCP tool {#deliverable}
- [ ] import_conversation MCP tool {#deliverable}
- [ ] Conversation summarizer for titles {#deliverable}
- [ ] Error handling for corrupted blobs {#deliverable}

---

## Open Questions & Decisions Needed

### Q1: Where to Store Imported Conversation?

**Options:**
A. **Metadata field** - `importedConversation: A2AMessage[]`
   - ✅ Accessible via read_plan
   - ❌ Bloats Y.Doc (MB-scale)
   - ❌ Syncs unnecessarily to all peers

B. **Separate Y.Array** - `YDOC_KEYS.IMPORTED_CONVERSATIONS`
   - ✅ Clean separation
   - ❌ Still stored in CRDT (large)

C. **Server-side only** - Store in LevelDB, not Y.Doc
   - ✅ Doesn't bloat CRDT
   - ✅ Available via MCP tool on demand
   - ❌ Not visible in browser (unless we add API)

D. **Don't store** - Just provide summary in plan content
   - ✅ Minimal storage
   - ✅ Human-readable summary in plan
   - ❌ Full conversation not available later

**Recommendation:** Option D (summary only) for MVP. Full conversation can be re-exported from source if needed.

### Q2: Fallback When P2P Unavailable?

**Scenarios:**
1. No peers connected (solo work)
2. Peer uses different network (can't establish WebRTC)
3. Firewall blocks WebRTC

**Fallback options:**
A. **File download/upload** - Export to `.a2a.json` file, manually share
B. **WebSocket relay** - Route through MCP server if both connected
C. **URL-encoded blob** - Compress heavily, embed in URL (risky - size limits)

**Recommendation:** Option A (file-based) as fallback. Option B (WebSocket relay) for future.

### Q3: What to Include from Tool Results?

**Options:**
A. **Full tool results** - Everything (could be huge - file reads, etc.)
B. **Summarized** - Just tool name + success/failure + key outputs
C. **Selective** - Include important tools (Write, Edit), skip reads

**Your preference:** Full tool results (Option A) "for now"

**Recommendation:** Implement Option A with warning if export > 10MB. Add summarization later if needed.

### Q4: How to Handle Platform-Specific Features?

**Examples:**
- Claude Code: `thinking` blocks
- Cursor: `toolFormerData`
- Devin: `structured_output`

**Approach:**
- Store in `metadata` field (A2A extensibility pattern)
- Receiving platform can use if compatible, ignore otherwise

```typescript
{
  messageId: "...",
  role: "agent",
  parts: [...],
  metadata: {
    platform: "claude-code",
    thinking: "extended thinking content...",
    usage: { inputTokens: 1000, ... },
    costUSD: 0.01234
  }
}
```

---

## Edge Cases

### 1. Transcript File Not Found

```
originTranscriptPath: "/Users/alice/.claude/projects/.../session-xyz.jsonl"
                                                              ↑
                                                          Doesn't exist
```

**Solution:**
- Check file existence before reading
- Error message: "Transcript file not found. Session may have been deleted."
- Fallback: Export only plan content (not full conversation)

### 2. Transcript Too Large

```
Full session: 500+ messages, 50MB uncompressed
→ Compressed: ~20MB with lz-string
→ Transfer time: ~30 seconds @ 5 Mbps
```

**Solution:**
- Show progress bar during transfer
- Allow cancellation
- Warn if > 10MB: "Large export, may take 30+ seconds"

### 3. No Connected Peers

```
User: "Export for Devin"
→ No Devin peer connected via WebRTC
```

**Solution:**
- Show: "No peers connected. Download file instead?"
- Button: "Download Export File"
- User manually sends file to Devin user

### 4. Peer Disconnects During Transfer

```
Transfer in progress (chunk 45/100)
→ WebRTC connection drops
```

**Solution:**
- Detect via `peer.on('close')`
- Show error: "Transfer failed - peer disconnected"
- Retry button or fallback to file download

### 5. Multiple Conversations for Same Plan

```
Plan created in Session A (100 messages)
→ Later opened in Session B (50 more messages)
→ Which session to export?
```

**Decision needed:**
- Export only the origin session (A)?
- Export all related sessions?
- Let user choose?

**Recommendation:** Origin session only (simplest). Later add "export current session" option.

---

## Success Criteria

1. ✅ Origin session ID captured when plan created (Claude Code via hook, others via MCP tool parameter)
2. ✅ Full Claude Code transcript can be parsed to A2A Message[]
3. ✅ Conversation blob compresses to < 40% of original size
4. ✅ P2P transfer works with 16 KiB chunks and backpressure handling
5. ✅ Export/import UI provides clear feedback and progress
6. ✅ File-based fallback works when P2P unavailable
7. ✅ Imported conversation creates new plan with summary

---

## Testing Plan

### Test 1: Capture Session ID (Claude Code)
```
1. Enter plan mode in Claude Code
2. Hook creates plan
3. Check Y.Doc metadata
4. Verify: originSessionId = <claude-session-uuid>
5. Verify: originTranscriptPath = ~/.claude/projects/.../session.jsonl
```

### Test 2: Transcript Parsing
```
1. Use real Claude Code session transcript
2. Call parseClaudeCodeTranscript()
3. Verify: All messages parsed
4. Verify: Tool uses/results included
5. Verify: No data loss
```

### Test 3: A2A Conversion
```
1. Parse transcript (100 messages)
2. Convert to A2A: claudeCodeToA2A()
3. Verify: messageId = original uuid
4. Verify: parts[] contains text + tool data
5. Verify: thinking blocks in metadata
6. Check size: Should be similar to original
```

### Test 4: Compression
```
1. A2A messages array (1MB uncompressed)
2. Compress with lz-string
3. Verify: < 600 KB (40-60% reduction)
4. Decompress and verify: Lossless round-trip
```

### Test 5: P2P Transfer
```
1. Open plan in Browser A (Claude side)
2. Open same plan in Browser B (Devin side)
3. Verify: WebRTC connected
4. Browser A: Export conversation → select Browser B
5. Verify: Progress bar shows chunks transferring
6. Browser B: Receives import notification
7. Verify: All messages received intact
8. Verify: Checksums match
```

### Test 6: Large Session (500+ messages)
```
1. Use real large session (~10MB)
2. Export via P2P
3. Monitor: Transfer time, buffering, completion
4. Verify: No dropped chunks
5. Verify: Memory usage acceptable (<100MB)
```

### Test 7: Fallback File Transfer
```
1. No peers connected
2. Click "Export Conversation"
3. Should show: "Download file"
4. Download .a2a.json file
5. In target platform: Upload file
6. Import succeeds
```

---

## Future Enhancements (Out of Scope)

- [ ] Support exporting from Cursor, Devin, etc. (not just Claude Code)
- [ ] WebSocket relay for cross-network transfers
- [ ] Conversation diff viewer (compare before/after handoff)
- [ ] Partial export (time range, specific messages only)
- [ ] Conversation search (find specific exchanges)
- [ ] A2A protocol compliance testing (validate against spec)
- [ ] Multi-hop transfer (Claude → Browser → Devin via relay)

---

## Related Issues

- #39: Activity feed - Different feature (auto-sync log, not full conversation export)
- #17: Claude Code integration - Hook system enables session ID capture
- #38: Agent naming - Helps identify who exported/imported

---

## Estimated Effort

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1: Capture origin metadata | 1 day | Low |
| Phase 2: JSONL → A2A converter | 2 days | Medium (testing) |
| Phase 3: WebRTC data channel | 3 days | High (chunking, backpressure) |
| Phase 4: Export/Import UI | 2 days | Low |
| Phase 5: MCP tools | 1 day | Low |

**Total: ~9 days (2 weeks with testing)**

**Highest risk:** Phase 3 (WebRTC custom messages using internal API)

---

*Created: 2026-01-13*
