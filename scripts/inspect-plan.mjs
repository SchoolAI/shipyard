#!/usr/bin/env node

/**
 * Diagnostic script to inspect plan metadata and origin data.
 * Usage: node scripts/inspect-plan.mjs <planId>
 */

import { getPlanMetadata, YDOC_KEYS } from '@shipyard/schema';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

const planId = process.argv[2];

if (!planId) {
  console.error('Usage: node scripts/inspect-plan.mjs <planId>');
  process.exit(1);
}

console.log(`\n🔍 Inspecting plan: ${planId}\n`);

// Connect to WebSocket server
const ydoc = new Y.Doc();

// Get WebSocket URL from registry
const registryUrl = 'http://localhost:32191/sessions';
let wsUrl;

try {
  const response = await fetch(registryUrl);
  const sessions = await response.json();

  if (sessions.length === 0) {
    console.error('❌ No active MCP sessions found');
    process.exit(1);
  }

  // Use first session
  wsUrl = sessions[0].wsUrl;
  console.log(`📡 Connecting to: ${wsUrl}`);
} catch (error) {
  console.error('❌ Failed to fetch registry:', error.message);
  process.exit(1);
}

const provider = new WebsocketProvider(
  wsUrl.replace('ws://', '').replace(/:\d+$/, '').split(':')[0],
  planId,
  ydoc,
  { connect: true }
);

provider.on('status', (event) => {
  if (event.status === 'connected') {
    console.log('✅ Connected to Y.Doc\n');
    inspectMetadata();
  }
});

provider.on('sync', (isSynced) => {
  if (isSynced) {
    console.log('✅ Document synced\n');
  }
});

/**
 * Format a timestamp as ISO string or 'N/A'.
 */
function formatTimestamp(ts) {
  return ts ? new Date(ts).toISOString() : 'N/A';
}

/**
 * Print basic plan metadata section.
 */
function printBasicMetadata(metadata) {
  console.log('📋 Plan Metadata:');
  console.log('─'.repeat(50));
  console.log(`Title: ${metadata.title}`);
  console.log(`Status: ${metadata.status}`);
  console.log(`Owner ID: ${metadata.ownerId || 'N/A'}`);
  console.log(`Repo: ${metadata.repo || 'N/A'}`);
  console.log(`PR: ${metadata.pr || 'N/A'}`);
  console.log(`Created: ${formatTimestamp(metadata.createdAt)}`);
  console.log(`Updated: ${formatTimestamp(metadata.updatedAt)}`);
}

/**
 * Print origin metadata for a specific platform.
 */
function printOriginDetails(origin) {
  console.log(`Platform: ${origin.platform}`);

  switch (origin.platform) {
    case 'claude-code': {
      console.log(`Session ID: ${origin.sessionId}`);
      console.log(`Transcript Path: ${origin.transcriptPath}`);
      console.log(`CWD: ${origin.cwd || 'N/A'}`);
      const hasTranscript = Boolean(origin.transcriptPath);
      console.log(`\n✨ Handoff button should ${hasTranscript ? '✅ APPEAR' : '❌ NOT APPEAR'}`);
      if (!hasTranscript) {
        console.log('⚠️  Missing transcript path!');
      }
      break;
    }
    case 'devin':
      console.log(`Session ID: ${origin.sessionId}`);
      break;
    case 'cursor':
      console.log(`Conversation ID: ${origin.conversationId}`);
      console.log(`Generation ID: ${origin.generationId || 'N/A'}`);
      break;
    default:
      console.log('Unknown platform - no additional data');
  }
}

/**
 * Print origin metadata section.
 */
function printOriginMetadata(origin) {
  console.log('\n🔗 Origin Metadata:');
  console.log('─'.repeat(50));

  if (origin) {
    printOriginDetails(origin);
  } else {
    console.log('❌ No origin metadata found');
    console.log('\n⚠️  This plan was likely created before origin metadata was implemented.');
    console.log('    The handoff button will NOT appear.');
  }
}

/**
 * Print raw metadata and Y.Doc keys for debugging.
 */
function printDebugInfo(ydoc) {
  console.log('\n🔧 Raw Metadata (for debugging):');
  console.log('─'.repeat(50));
  const metaMap = ydoc.getMap(YDOC_KEYS.METADATA);
  console.log(JSON.stringify(metaMap.toJSON(), null, 2));

  console.log('\n📦 Y.Doc Keys Present:');
  console.log('─'.repeat(50));
  const keys = [
    ['metadata', ydoc.getMap('metadata').size > 0],
    ['document', ydoc.getXmlFragment('document').toString().length > 0],
    ['content', ydoc.getArray('content').length > 0],
    ['threads', ydoc.getMap('threads').size > 0],
    ['artifacts', ydoc.getArray('artifacts').length > 0],
  ];
  for (const [key, present] of keys) {
    console.log(`${key}: ${present ? '✅' : '❌'}`);
  }
}

function inspectMetadata() {
  try {
    const metadata = getPlanMetadata(ydoc);
    printBasicMetadata(metadata);
    printOriginMetadata(metadata.origin);
    printDebugInfo(ydoc);
  } catch (error) {
    console.error('❌ Error inspecting metadata:', error);
  } finally {
    setTimeout(() => {
      provider.destroy();
      process.exit(0);
    }, 1000);
  }
}

// Handle errors
provider.on('connection-error', (error) => {
  console.error('❌ Connection error:', error);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Timeout waiting for connection');
  provider.destroy();
  process.exit(1);
}, 10000);
