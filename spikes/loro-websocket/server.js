/**
 * Spike: loro-extended WebSocket server (MCP simulation)
 *
 * Tests:
 * 1. Server creates and owns a document with schema
 * 2. Server syncs document to connected clients via WebSocket
 * 3. Server receives changes from clients
 */

import { WsServerNetworkAdapter, wrapWsSocket } from '@loro-extended/adapter-websocket/server';
import { Repo, Shape } from '@loro-extended/repo';
import { WebSocketServer } from 'ws';

const PORT = 3456;

// Plan schema - matches what MCP would use
const PlanSchema = Shape.doc({
  meta: Shape.struct({
    id: Shape.plain.string(),
    title: Shape.plain.string(),
    status: Shape.plain.string(),
    createdAt: Shape.plain.number(),
  }),
  steps: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      title: Shape.plain.string(),
      done: Shape.plain.boolean(),
    })
  ),
  annotations: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      stepId: Shape.plain.string(),
      author: Shape.plain.string(),
      content: Shape.plain.string(),
    })
  ),
});

console.log('Starting loro-extended WebSocket server spike...\n');

// 1. Create WebSocket adapter
const wsAdapter = new WsServerNetworkAdapter();

// 2. Create repo with adapter
const repo = new Repo({ adapters: [wsAdapter] });
console.log('Repo created');

// 3. Create a plan document (as MCP would)
const DOC_ID = 'plan-spike-001';
const handle = repo.get(DOC_ID, PlanSchema);

// 4. Initialize the plan
handle.change((draft) => {
  draft.meta.id = DOC_ID;
  draft.meta.title = 'Implementation Plan: Add User Auth';
  draft.meta.status = 'pending_review';
  draft.meta.createdAt = Date.now();

  draft.steps.push({
    id: 'step-1',
    title: 'Create auth middleware',
    done: false,
  });
  draft.steps.push({
    id: 'step-2',
    title: 'Add login endpoint',
    done: false,
  });
  draft.steps.push({
    id: 'step-3',
    title: 'Write tests',
    done: false,
  });
});

console.log('Plan created:', handle.doc.toJSON().meta.title);
console.log('Steps:', handle.doc.toJSON().steps.length);

// 5. Subscribe to changes (simulates MCP watching for feedback)
handle.doc.$.loroDoc.subscribe((event) => {
  console.log('\n=== Document changed ===');
  const data = handle.doc.toJSON();
  console.log('Status:', data.meta.status);
  console.log('Annotations:', data.annotations.length);
  if (data.annotations.length > 0) {
    console.log('Latest annotation:', data.annotations[data.annotations.length - 1]);
  }
});

// 6. Create WebSocket server
const wss = new WebSocketServer({ port: PORT });
console.log(`\nWebSocket server listening on ws://localhost:${PORT}`);
console.log(`Document ID: ${DOC_ID}`);

// 7. Handle connections
wss.on('connection', (ws) => {
  console.log('\n>>> Client connected');

  const { start } = wsAdapter.handleConnection({
    socket: wrapWsSocket(ws),
  });
  start();

  ws.on('close', () => console.log('<<< Client disconnected'));
});

console.log("\nServer ready. Run 'node client.js' to test sync.");
console.log('The client will add an annotation that should appear here.\n');
