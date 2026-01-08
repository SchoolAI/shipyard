/**
 * Loro Markdown Sync Spike (Polling Version)
 *
 * Polls files every 20ms instead of using file watchers.
 * Testing if this feels smoother than event-based sync.
 */

import { LoroDoc } from "loro-crdt";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ============================================================================
// Config
// ============================================================================

const FILE_A = resolve(process.argv[2] || "plan-a.md");
const FILE_B = resolve(process.argv[3] || "plan-b.md");
const POLL_INTERVAL = 20; // ms between file reads
const WRITE_DELAY = 100; // ms to wait before writing back

// ============================================================================
// State
// ============================================================================

const doc = new LoroDoc();
const text = doc.getText("content");

// Track last known content of each file
let lastContentA = "";
let lastContentB = "";

// Track what we last wrote to avoid feedback
let lastWrittenA = "";
let lastWrittenB = "";

// Write timers
let writeTimerA: NodeJS.Timeout | null = null;
let writeTimerB: NodeJS.Timeout | null = null;

// Stats
let pollCount = 0;
let syncCount = 0;

// ============================================================================
// Core Functions
// ============================================================================

function log(msg: string, data?: object) {
  const ts = new Date().toISOString().split("T")[1].slice(0, 12);
  console.log(`[${ts}] ${msg}`, data ? JSON.stringify(data) : "");
}

function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function writeFile(path: string, content: string) {
  writeFileSync(path, content, "utf-8");
}

function getCrdtContent(): string {
  return text.toString();
}

function updateCrdt(newContent: string) {
  text.update(newContent);
  doc.commit();
}

// ============================================================================
// Sync Logic
// ============================================================================

function scheduleWrite(filePath: string, label: string) {
  const timer = label === "A" ? writeTimerA : writeTimerB;
  if (timer) clearTimeout(timer);

  const newTimer = setTimeout(() => {
    const content = getCrdtContent();

    if (label === "A") {
      if (content !== lastWrittenA) {
        writeFile(filePath, content);
        lastWrittenA = content;
        lastContentA = content; // Update last known to avoid re-reading our own write
      }
      writeTimerA = null;
    } else {
      if (content !== lastWrittenB) {
        writeFile(filePath, content);
        lastWrittenB = content;
        lastContentB = content;
      }
      writeTimerB = null;
    }
  }, WRITE_DELAY);

  if (label === "A") writeTimerA = newTimer;
  else writeTimerB = newTimer;
}

function pollFile(filePath: string, label: string, lastContent: string, lastWritten: string): string {
  const currentContent = readFile(filePath);

  // No change from what we know
  if (currentContent === lastContent) {
    return lastContent;
  }

  // This is our own write coming back
  if (currentContent === lastWritten) {
    return currentContent;
  }

  // Skip empty content overwriting real content
  if (currentContent.trim() === "" && getCrdtContent().trim() !== "") {
    return lastContent;
  }

  // Real change detected!
  const crdtContent = getCrdtContent();
  if (currentContent !== crdtContent) {
    syncCount++;
    log(`Sync ${label} → CRDT (#${syncCount})`, {
      fileLen: currentContent.length,
      crdtLen: crdtContent.length
    });

    updateCrdt(currentContent);

    // Schedule writes to both files
    scheduleWrite(FILE_A, "A");
    scheduleWrite(FILE_B, "B");

    // Log state occasionally
    if (syncCount % 5 === 0) {
      logState();
    }
  }

  return currentContent;
}

function pollLoop() {
  pollCount++;

  lastContentA = pollFile(FILE_A, "A", lastContentA, lastWrittenA);
  lastContentB = pollFile(FILE_B, "B", lastContentB, lastWrittenB);

  setTimeout(pollLoop, POLL_INTERVAL);
}

// ============================================================================
// Logging
// ============================================================================

function logState() {
  const content = getCrdtContent();
  console.log("\n--- CRDT State ---");
  console.log(`Characters: ${content.length} | Polls: ${pollCount} | Syncs: ${syncCount}`);
  console.log("Content:");
  console.log(content.slice(0, 300) + (content.length > 300 ? "..." : ""));
  console.log("------------------\n");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        Loro Markdown Sync Spike (Polling @ ${POLL_INTERVAL}ms)             ║
╠══════════════════════════════════════════════════════════════╣
║  File A: ${FILE_A.slice(-45).padStart(45)}  ║
║  File B: ${FILE_B.slice(-45).padStart(45)}  ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Initialize files
  if (!existsSync(FILE_A)) writeFile(FILE_A, "");
  if (!existsSync(FILE_B)) writeFile(FILE_B, "");

  const contentA = readFile(FILE_A);
  const contentB = readFile(FILE_B);

  if (contentA) {
    log("Initializing from File A");
    updateCrdt(contentA);
    lastContentA = contentA;
    lastWrittenA = contentA;
    if (contentB !== contentA) {
      writeFile(FILE_B, contentA);
      lastContentB = contentA;
      lastWrittenB = contentA;
    } else {
      lastContentB = contentB;
      lastWrittenB = contentB;
    }
  } else if (contentB) {
    log("Initializing from File B");
    updateCrdt(contentB);
    lastContentB = contentB;
    lastWrittenB = contentB;
    writeFile(FILE_A, contentB);
    lastContentA = contentB;
    lastWrittenA = contentB;
  } else {
    const initial = `# Plan

## Tasks

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Notes

Edit either file and watch them sync!
`;
    log("Creating initial content");
    updateCrdt(initial);
    writeFile(FILE_A, initial);
    writeFile(FILE_B, initial);
    lastContentA = initial;
    lastContentB = initial;
    lastWrittenA = initial;
    lastWrittenB = initial;
  }

  logState();

  log(`Starting poll loop (${POLL_INTERVAL}ms interval)...`);
  pollLoop();

  process.on("SIGINT", () => {
    console.log("\n\nFinal state:");
    console.log(`Total polls: ${pollCount}, Total syncs: ${syncCount}`);
    logState();
    process.exit(0);
  });
}

main().catch(console.error);
