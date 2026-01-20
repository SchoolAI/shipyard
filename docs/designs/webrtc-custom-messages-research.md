# WebRTC Custom Messages Research: Sending Large Binary Blobs Over y-webrtc

**Date:** 2026-01-13
**Context:** Research for P2P file transfer feature (conversation exports, MB-scale binary blobs)
**Goal:** Send one-time custom messages over y-webrtc's WebRTC connections without storing in Y.Doc

---

## Executive Summary

**Can we send custom messages over y-webrtc?**

**Short answer:** Not directly through the official API. y-webrtc doesn't expose a public API for custom messages, but there are **three viable approaches**:

1. **Access underlying simple-peer connections** (via `peers` event) — Most direct
2. **Use Awareness protocol** (recommended by maintainer for small metadata) — Not suitable for MB-scale
3. **Fork/patch y-webrtc** to add custom message type — Most invasive

**For MB-scale binary transfers, we recommend:** Approach #1 (access simple-peer directly) with application-level chunking.

---

## 1. Does y-webrtc Expose RTCDataChannel?

### Official API

**No direct access.** The y-webrtc library does not provide a documented API to access the underlying RTCDataChannel or simple-peer instances.

From the [y-webrtc README](https://github.com/yjs/y-webrtc):
> "Just listen to the 'peers' event from the provider to listen for more incoming WebRTC connections and use the simple-peer API to share streams."

This suggests the library **does** provide access, but only through an undocumented `peers` event.

### Internal Structure (from source code analysis)

y-webrtc uses [simple-peer](https://github.com/feross/simple-peer) internally to manage WebRTC connections. Key findings from source code:

```javascript
// From y-webrtc.js
class WebrtcConn {
  constructor(signalingConn, initiator, remotePeerId, room) {
    this.peer = new Peer({ initiator, ...room.provider.peerOpts })

    this.peer.on('data', data => {
      const answer = readPeerMessage(this, data)
      // ... processes CRDT messages
    })

    this.peer.on('connect', () => {
      // ... connection established
    })
  }
}
```

**Key insight:** Each WebRTC connection has a `peer` property that is a `simple-peer` instance. This peer can send arbitrary binary data via `peer.send(data)`.

### The `peers` Event

The documentation mentions a `peers` event that emits:
```javascript
{
  removed: [],           // Array of peer IDs that disconnected
  added: [peerId],       // Array of peer IDs that connected
  webrtcPeers: [...],    // Array of all WebRTC peer connection keys
  bcPeers: [...]         // Array of BroadcastChannel peer connections
}
```

**Issue:** The `peers` event gives you **peer IDs**, not the actual peer objects. You would need to access internal state to get the `simple-peer` instances.

---

## 2. Can We Send Custom Messages Alongside CRDT Sync?

### Message Protocol Structure

y-webrtc uses a binary protocol with numeric message types:

```javascript
// Message type constants
const messageSync = 0           // Document synchronization
const messageAwareness = 1      // Share awareness updates
const messageQueryAwareness = 3 // Query peer awareness state
const messageBcPeerId = 4       // Broadcast peer identification
```

Messages are encoded as:
1. Message type (varint)
2. Message-specific payload (binary)

### Attempted Custom Messages (GitHub Issue #18)

A developer tried sending custom messages via `peer.send(myMessage)` for cursor positions. The library's message handler threw an error:

> **"Unable to compute message"** at line 117 of y-webrtc.js

This happens because the `readPeerMessage` function has a switch statement that only handles the predefined message types above.

### Maintainer's Response (@dmonad)

From [Issue #18](https://github.com/yjs/y-webrtc/issues/18):

1. **Use Awareness Protocol (recommended for small metadata):**
   - The existing awareness protocol is designed for cursor positions, presence, etc.
   - Propagates via CRDT, so it's guaranteed to reach all peers
   - **Limitation:** Not suitable for MB-scale binary data

2. **Custom Message Format (potential feature):**
   - Maintainer suggested discussing "an extension to the y-webrtc protocol that handles custom messages"
   - Would require adding a new message type like `messageCustom = 5`
   - **Status:** Not implemented as of 2025

3. **Warning about custom protocols:**
   - "y-webrtc doesn't guarantee a fully connected network"
   - Custom protocols risk sync issues if not all peers are connected

---

## 3. Recommended Pattern for P2P File Transfer

### Approach: Access simple-peer Directly

**Strategy:** Listen to the `peers` event and access the internal `simple-peer` connections to send custom binary data.

#### Implementation Pattern

```typescript
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

const ydoc = new Y.Doc();
const provider = new WebrtcProvider('my-room', ydoc);

// Access internal peer connections (TypeScript will complain - we're going off-road)
const room = (provider as any).room;

// Listen for new peers
provider.on('peers', ({ added, removed, webrtcPeers }) => {
  console.log('Peers changed:', { added, removed, webrtcPeers });

  // Access WebRTC connections
  if (room && room.webrtcConns) {
    for (const [peerId, webrtcConn] of room.webrtcConns) {
      const peer = webrtcConn.peer; // This is a simple-peer instance

      // Now we can use simple-peer's API
      peer.on('data', (data) => {
        // Check if this is our custom message (not a Yjs message)
        if (isCustomMessage(data)) {
          handleCustomMessage(data);
        }
        // Note: Yjs messages will also come through here
      });

      // Send custom binary data
      if (peer.connected) {
        peer.send(createCustomMessage(myBinaryData));
      }
    }
  }
});

// Message format to distinguish custom messages from Yjs
function isCustomMessage(data: Uint8Array): boolean {
  // Yjs uses message types 0-4. We can use 255 for custom messages.
  // Or use a magic byte sequence at the start.
  return data[0] === 0xFF; // Custom message marker
}

function createCustomMessage(payload: Uint8Array): Uint8Array {
  // Prepend a marker byte so we can identify our messages
  const message = new Uint8Array(1 + payload.length);
  message[0] = 0xFF; // Custom message marker
  message.set(payload, 1);
  return message;
}
```

**Pros:**
- Direct access to WebRTC data channels
- Can send arbitrary binary data
- No modification to y-webrtc needed

**Cons:**
- Uses internal/private API (no stability guarantees)
- Need to distinguish custom messages from Yjs protocol messages
- Network topology is not fully connected (some peers may not receive data)

#### Current Codebase Pattern

From `/Users/jacobpetterle/Working Directory/shipyard/apps/web/src/hooks/useMultiProviderSync.ts`, the codebase already accesses internal y-webrtc state:

```typescript
// Access internal signaling connections (lines 306-315, 343-353)
const signalingConns = (rtc as unknown as { signalingConns: Array<{ ws: WebSocket }> })
  .signalingConns;

if (signalingConns) {
  for (const conn of signalingConns) {
    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(identifyMessage);
    }
  }
}
```

**This same pattern can be used to access WebRTC peer connections:**

```typescript
// Access internal WebRTC peer connections
const room = (rtc as unknown as { room: any }).room;

if (room && room.webrtcConns) {
  for (const [peerId, webrtcConn] of room.webrtcConns) {
    const peer = webrtcConn.peer; // simple-peer instance
    if (peer.connected) {
      peer.send(customBinaryData);
    }
  }
}
```

---

## 4. WebRTC Data Channel Size Limits

### Practical Limits (2025)

From [Lennart Grahl's analysis](https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html) and [Mozilla blog](https://blog.mozilla.org/webrtc/large-data-channel-messages/):

**Safe across Firefox and Chromium:**
- **64 KiB** for unordered or unreliable channels
- **16 KiB** when sending from Firefox to Chromium on ordered AND reliable channels

**Why these limits?**
- Firefox implements deprecated SCTP fragmentation (16 KiB chunks) for ordered, reliable channels
- Chromium doesn't reassemble these chunks properly
- Chromium closes channels when messages exceed 256 KiB

**Maximum message size (negotiated via SDP):**
- Default: 64 KiB
- Modern browsers support up to 256 KiB
- SCTP protocol theoretically supports gigabytes, but browser implementations impose limits

### Recommendation: Application-Level Chunking

**For MB-scale files, MUST implement chunking at the application level.**

**Recommended chunk size:** 16 KiB (16,384 bytes) for maximum cross-browser compatibility

From [RTCDataChannel Complete Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/):
> "For maximum cross-browser compatibility, setting the chunk size to 16384 bytes (16 KiB) is recommended to be safe."

---

## 5. Chunking Strategy for Large Files

### Chunked Transfer Protocol

```typescript
// Message types
const CHUNK_START = 0xF0;
const CHUNK_DATA = 0xF1;
const CHUNK_END = 0xF2;

interface ChunkStartMessage {
  type: typeof CHUNK_START;
  transferId: string;    // UUID for this transfer
  totalSize: number;     // Total bytes
  chunkCount: number;    // Number of chunks
  filename?: string;     // Optional metadata
  mimeType?: string;
}

interface ChunkDataMessage {
  type: typeof CHUNK_DATA;
  transferId: string;
  chunkIndex: number;
  data: Uint8Array;      // Max 16 KiB
}

interface ChunkEndMessage {
  type: typeof CHUNK_END;
  transferId: string;
  checksum?: string;     // Optional integrity check
}

class FileTransferManager {
  private readonly CHUNK_SIZE = 16 * 1024; // 16 KiB
  private activeTransfers = new Map<string, {
    chunks: Map<number, Uint8Array>;
    totalChunks: number;
    metadata?: any;
  }>();

  async sendFile(peer: any, file: Uint8Array, metadata?: any): Promise<void> {
    const transferId = crypto.randomUUID();
    const chunkCount = Math.ceil(file.byteLength / this.CHUNK_SIZE);

    // Send start message
    const startMsg: ChunkStartMessage = {
      type: CHUNK_START,
      transferId,
      totalSize: file.byteLength,
      chunkCount,
      ...metadata,
    };
    peer.send(this.encode(startMsg));

    // Send chunks with backpressure handling
    for (let i = 0; i < chunkCount; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, file.byteLength);
      const chunk = file.slice(start, end);

      const chunkMsg: ChunkDataMessage = {
        type: CHUNK_DATA,
        transferId,
        chunkIndex: i,
        data: chunk,
      };

      // Check backpressure (simple-peer has bufferedAmount)
      while (peer.bufferedAmount && peer.bufferedAmount > 1024 * 1024) {
        // Wait 100ms if more than 1MB buffered
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      peer.send(this.encode(chunkMsg));
    }

    // Send end message
    const endMsg: ChunkEndMessage = {
      type: CHUNK_END,
      transferId,
    };
    peer.send(this.encode(endMsg));
  }

  handleMessage(data: Uint8Array): void {
    const msg = this.decode(data);

    switch (msg.type) {
      case CHUNK_START:
        this.activeTransfers.set(msg.transferId, {
          chunks: new Map(),
          totalChunks: msg.chunkCount,
          metadata: msg,
        });
        break;

      case CHUNK_DATA:
        const transfer = this.activeTransfers.get(msg.transferId);
        if (transfer) {
          transfer.chunks.set(msg.chunkIndex, msg.data);

          // Check if complete
          if (transfer.chunks.size === transfer.totalChunks) {
            this.assembleAndEmit(msg.transferId, transfer);
          }
        }
        break;

      case CHUNK_END:
        // Optional: verify completion
        break;
    }
  }

  private assembleAndEmit(transferId: string, transfer: any): void {
    const chunks = Array.from(transfer.chunks.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, chunk]) => chunk);

    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const assembled = new Uint8Array(totalSize);

    let offset = 0;
    for (const chunk of chunks) {
      assembled.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Emit completed transfer event
    this.emit('transfer-complete', {
      transferId,
      data: assembled,
      metadata: transfer.metadata,
    });

    // Cleanup
    this.activeTransfers.delete(transferId);
  }

  private encode(msg: any): Uint8Array {
    // Use MessagePack, CBOR, or JSON + custom binary format
    return new TextEncoder().encode(JSON.stringify(msg));
  }

  private decode(data: Uint8Array): any {
    return JSON.parse(new TextDecoder().decode(data));
  }
}
```

### Key Considerations

1. **Backpressure Handling**
   - Check `peer.bufferedAmount` before sending chunks
   - Wait if buffer exceeds threshold (e.g., 1MB)
   - Prevents memory issues and connection drops

2. **Error Handling**
   - Implement timeout for transfers
   - Handle peer disconnection mid-transfer
   - Support resume/retry for failed chunks

3. **Progress Reporting**
   - Emit progress events based on chunk count
   - Show UI feedback for long transfers

4. **Concurrent Transfers**
   - Use unique `transferId` per transfer
   - Support multiple simultaneous transfers per peer

---

## 6. Alternative: Use Awareness for Small Metadata

### When to Use Awareness

The awareness protocol is suitable for:
- Cursor positions (<1 KB)
- User presence (<1 KB)
- Small UI state (<10 KB)

**Example from current codebase** (useMultiProviderSync.ts, lines 268-279):

```typescript
const awarenessState: PlanAwarenessState = {
  user: {
    id: githubIdentity.username,
    name: githubIdentity.displayName,
    color: colorFromString(githubIdentity.username),
  },
  status,
  isOwner: ownerId === githubIdentity.username,
  requestedAt: status === 'pending' ? Date.now() : undefined,
};

rtc.awareness.setLocalStateField('planStatus', awarenessState);
```

**Awareness is NOT suitable for:**
- Binary blobs >100 KB
- One-time messages (awareness state persists)
- Files/exports/large data

---

## 7. Recommendations for Shipyard

### For Conversation Export Feature (MB-scale binary blobs)

**Recommended approach: Access simple-peer directly + chunking**

```typescript
// In a new hook: useP2PFileTransfer.ts
export function useP2PFileTransfer(rtcProvider: WebrtcProvider | null) {
  const transferManager = useMemo(() => new FileTransferManager(), []);

  useEffect(() => {
    if (!rtcProvider) return;

    // Access internal peer connections
    const room = (rtcProvider as any).room;
    if (!room) return;

    // Setup listeners on existing peers
    if (room.webrtcConns) {
      for (const [peerId, webrtcConn] of room.webrtcConns) {
        const peer = webrtcConn.peer;

        peer.on('data', (data: Uint8Array) => {
          // Check if this is a file transfer message (0xF0-0xF2)
          if (data[0] >= 0xF0 && data[0] <= 0xF2) {
            transferManager.handleMessage(data);
          }
          // Otherwise, let Yjs handle it
        });
      }
    }

    // Listen for new peers
    rtcProvider.on('peers', ({ added }) => {
      if (room.webrtcConns) {
        for (const peerId of added) {
          const webrtcConn = room.webrtcConns.get(peerId);
          if (webrtcConn) {
            const peer = webrtcConn.peer;

            peer.on('data', (data: Uint8Array) => {
              if (data[0] >= 0xF0 && data[0] <= 0xF2) {
                transferManager.handleMessage(data);
              }
            });
          }
        }
      }
    });

    return () => {
      // Cleanup
    };
  }, [rtcProvider, transferManager]);

  const sendFile = useCallback(async (file: Uint8Array, metadata?: any) => {
    if (!rtcProvider) return;

    const room = (rtcProvider as any).room;
    if (!room || !room.webrtcConns) return;

    // Broadcast to all connected peers
    for (const [peerId, webrtcConn] of room.webrtcConns) {
      const peer = webrtcConn.peer;
      if (peer.connected) {
        await transferManager.sendFile(peer, file, metadata);
      }
    }
  }, [rtcProvider, transferManager]);

  return {
    sendFile,
    onTransferComplete: (callback: Function) => {
      transferManager.on('transfer-complete', callback);
    },
  };
}
```

### Fallback Strategy

**If no WebRTC peers are connected:**
- Fall back to WebSocket server for relay
- Or store in Y.Doc temporarily (with TTL and cleanup)
- Or use GitHub as blob storage (per ADR-0001)

### Network Topology Consideration

y-webrtc **does not guarantee a fully connected mesh**. Some peers may not be directly connected.

**Solutions:**
1. **Epidemic broadcast:** Forward received files to all your peers
2. **Request missing data:** Peers can request files they haven't received
3. **Use WebSocket as fallback:** Server relays to unreachable peers

---

## 8. Code Examples

### Example 1: Send Custom Binary Message

```typescript
function sendCustomMessage(provider: WebrtcProvider, data: Uint8Array) {
  const room = (provider as any).room;
  if (!room || !room.webrtcConns) {
    console.warn('No WebRTC peers connected');
    return;
  }

  // Prepend custom message marker
  const message = new Uint8Array(1 + data.length);
  message[0] = 0xFF; // Custom marker (not used by Yjs)
  message.set(data, 1);

  // Send to all connected peers
  let sentCount = 0;
  for (const [peerId, webrtcConn] of room.webrtcConns) {
    const peer = webrtcConn.peer;
    if (peer.connected) {
      peer.send(message);
      sentCount++;
    }
  }

  console.log(`Sent custom message to ${sentCount} peers`);
}
```

### Example 2: Receive Custom Messages

```typescript
function setupCustomMessageListener(provider: WebrtcProvider, handler: (data: Uint8Array) => void) {
  const room = (provider as any).room;
  if (!room) return;

  // Listen for new peers
  provider.on('peers', ({ added }) => {
    if (!room.webrtcConns) return;

    for (const peerId of added) {
      const webrtcConn = room.webrtcConns.get(peerId);
      if (!webrtcConn) continue;

      const peer = webrtcConn.peer;

      // Add listener for custom messages
      peer.on('data', (data: Uint8Array) => {
        // Check for our custom marker
        if (data[0] === 0xFF) {
          // Strip marker and pass to handler
          handler(data.slice(1));
        }
        // Yjs will handle its own messages automatically
      });
    }
  });
}
```

### Example 3: Full File Transfer

```typescript
import { useCallback, useEffect, useState } from 'react';
import { WebrtcProvider } from 'y-webrtc';

export function useFileTransfer(provider: WebrtcProvider | null) {
  const [transferProgress, setTransferProgress] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!provider) return;

    const room = (provider as any).room;
    if (!room) return;

    const manager = new FileTransferManager();

    manager.on('transfer-complete', ({ transferId, data, metadata }) => {
      console.log('Received file:', metadata);
      // Handle received file
      onFileReceived(data, metadata);
    });

    manager.on('progress', ({ transferId, progress }) => {
      setTransferProgress(prev => new Map(prev).set(transferId, progress));
    });

    // Setup listeners on all peers
    const setupPeerListener = (peer: any) => {
      peer.on('data', (data: Uint8Array) => {
        if (data[0] >= 0xF0 && data[0] <= 0xF2) {
          manager.handleMessage(data);
        }
      });
    };

    // Existing peers
    if (room.webrtcConns) {
      for (const [, webrtcConn] of room.webrtcConns) {
        setupPeerListener(webrtcConn.peer);
      }
    }

    // New peers
    provider.on('peers', ({ added }) => {
      if (room.webrtcConns) {
        for (const peerId of added) {
          const webrtcConn = room.webrtcConns.get(peerId);
          if (webrtcConn) {
            setupPeerListener(webrtcConn.peer);
          }
        }
      }
    });

    return () => {
      manager.removeAllListeners();
    };
  }, [provider]);

  const sendFile = useCallback(async (file: Uint8Array, metadata?: any) => {
    if (!provider) return;

    const room = (provider as any).room;
    if (!room || !room.webrtcConns) {
      throw new Error('No WebRTC peers connected');
    }

    const manager = new FileTransferManager();
    const promises = [];

    for (const [peerId, webrtcConn] of room.webrtcConns) {
      const peer = webrtcConn.peer;
      if (peer.connected) {
        promises.push(manager.sendFile(peer, file, metadata));
      }
    }

    await Promise.all(promises);
  }, [provider]);

  return { sendFile, transferProgress };
}

function onFileReceived(data: Uint8Array, metadata: any) {
  // Create blob and trigger download, or store in IndexedDB, etc.
  const blob = new Blob([data], { type: metadata.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = metadata.filename || 'download';
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 9. Summary & Decision Points

### Questions Answered

1. **Does y-webrtc expose RTCDataChannel?**
   - Not officially, but accessible via internal `room.webrtcConns` → `peer` property

2. **Can we send custom messages alongside CRDT sync?**
   - Yes, via accessing simple-peer directly
   - Need to distinguish custom messages from Yjs protocol (use marker byte)

3. **Recommended pattern for P2P file transfer?**
   - Access simple-peer connections + application-level chunking
   - Use 16 KiB chunks for cross-browser compatibility
   - Implement backpressure handling

4. **Size limits for WebRTC data channels?**
   - Safe: 16 KiB (all browsers, all configs)
   - Modern: 64 KiB (most browsers, some configs)
   - Negotiated max: 256 KiB (but unreliable)

5. **Chunking strategies?**
   - See FileTransferManager implementation above
   - Use transfer IDs, handle reassembly, support progress tracking

### Recommended Implementation Path

1. **Create `useP2PFileTransfer` hook**
   - Access internal simple-peer connections
   - Implement FileTransferManager with 16 KiB chunks
   - Handle backpressure and progress reporting

2. **Add fallback for disconnected peers**
   - Relay via WebSocket server
   - Or epidemic broadcast through mesh

3. **Integrate with conversation export**
   - Export conversation to JSON
   - Compress with gzip
   - Send via P2P file transfer

4. **Monitor for y-webrtc updates**
   - Check if official custom message support is added
   - Refactor if/when available

---

## Sources

- [GitHub - yjs/y-webrtc](https://github.com/yjs/y-webrtc)
- [y-webrtc Issue #18: Custom Messages Discussion](https://github.com/yjs/y-webrtc/issues/18)
- [y-webrtc Source Code](https://github.com/yjs/y-webrtc/blob/master/src/y-webrtc.js)
- [Yjs Documentation - y-webrtc](https://docs.yjs.dev/ecosystem/connection-provider/y-webrtc)
- [GitHub - feross/simple-peer](https://github.com/feross/simple-peer)
- [MDN - Using WebRTC Data Channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels)
- [WebRTC.org - Data Channels](https://webrtc.org/getting-started/data-channels)
- [Demystifying WebRTC's Data Channel Message Size Limitations](https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html)
- [Mozilla Blog - Large Data Channel Messages](https://blog.mozilla.org/webrtc/large-data-channel-messages/)
- [RTCDataChannel Complete Guide - WebRTC.link](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/)
- [Building a Real-Time Peer-to-Peer Group Chat in Next.js with WebRTC and Yjs](https://medium.com/@vaibhav.pathak_65999/building-a-real-time-peer-to-peer-group-chat-in-next-js-with-webrtc-and-yjs-d9c1e5f3e396)
- [Serverless Yjs - Medium](https://medium.com/collaborne-engineering/serverless-yjs-72d0a84326a2)
- [Decentralized collaboration with Yjs and WebRTC - Tag1](https://www.tag1.com/blog/yjs-webrtc-part-1/)
- [WebRTC File Transfer Tutorial](https://deepstream.io/tutorials/webrtc/webrtc-file-transfer/)

---

**Next Steps:**
1. Create proof-of-concept file transfer hook
2. Test chunking with large files (1-10 MB)
3. Measure performance and reliability across browser combinations
4. Implement fallback strategies for disconnected peers
