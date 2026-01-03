/**
 * Spike: loro-extended WebSocket client (Browser simulation)
 *
 * Tests:
 * 1. Client connects to server via WebSocket
 * 2. Client receives document from server
 * 3. Client adds annotation that syncs back to server
 */

import { Repo, Shape } from "@loro-extended/repo";
import { WsClientNetworkAdapter } from "@loro-extended/adapter-websocket/client";
import WebSocket from "ws";

// Polyfill WebSocket for Node.js (browsers have this natively)
globalThis.WebSocket = WebSocket;

const SERVER_URL = "ws://localhost:3456";
const DOC_ID = "plan-spike-001";

// Same schema as server
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

console.log("Starting loro-extended WebSocket client spike...");
console.log(`Connecting to ${SERVER_URL}...`);

// 1. Create WebSocket adapter
const wsAdapter = new WsClientNetworkAdapter({
  url: SERVER_URL,
});

// 2. Create client repo
const repo = new Repo({
  adapters: [wsAdapter],
});

console.log("Client repo created, getting document...");

// 3. Get the document handle (will sync from server)
const handle = repo.get(DOC_ID, PlanSchema);

// 4. Wait for sync to complete
console.log("Waiting for sync...");
await handle.waitForSync();

// 5. Read the synced document
const data = handle.doc.toJSON();
console.log("\n=== Document received from server ===");
console.log("Title:", data.meta.title);
console.log("Status:", data.meta.status);
console.log("Steps:", data.steps.map(s => s.title).join(", "));
console.log("Current annotations:", data.annotations.length);

// 6. Add an annotation (simulates reviewer feedback)
console.log("\n=== Adding annotation from client ===");
handle.change(draft => {
  draft.annotations.push({
    id: `ann-${Date.now()}`,
    stepId: "step-1",
    author: "reviewer-browser",
    content: "This middleware should also handle refresh tokens.",
  });
});

console.log("Annotation added!");
console.log("Check the server terminal - it should show the new annotation.");

// 7. Wait a moment to see sync
await new Promise(r => setTimeout(r, 2000));

console.log("\nFinal state:", handle.doc.toJSON().annotations.length, "annotations");
console.log("Client done.");
process.exit(0);
