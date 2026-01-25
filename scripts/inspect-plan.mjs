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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Utility script, complexity is acceptable
function inspectMetadata() {
  try {
    // Get metadata using helper
    const metadata = getPlanMetadata(ydoc);

    console.log('📋 Plan Metadata:');
    console.log('─'.repeat(50));
    console.log(`Title: ${metadata.title}`);
    console.log(`Status: ${metadata.status}`);
    console.log(`Owner ID: ${metadata.ownerId || 'N/A'}`);
    console.log(`Repo: ${metadata.repo || 'N/A'}`);
    console.log(`PR: ${metadata.pr || 'N/A'}`);
    console.log(
      `Created: ${metadata.createdAt ? new Date(metadata.createdAt).toISOString() : 'N/A'}`
    );
    console.log(
      `Updated: ${metadata.updatedAt ? new Date(metadata.updatedAt).toISOString() : 'N/A'}`
    );

    console.log('\n🔗 Origin Metadata:');
    console.log('─'.repeat(50));

    if (metadata.origin) {
      console.log(`Platform: ${metadata.origin.platform}`);

      if (metadata.origin.platform === 'claude-code') {
        console.log(`Session ID: ${metadata.origin.sessionId}`);
        console.log(`Transcript Path: ${metadata.origin.transcriptPath}`);
        console.log(`CWD: ${metadata.origin.cwd || 'N/A'}`);

        // Check if handoff button should appear
        const hasTranscript = Boolean(metadata.origin.transcriptPath);
        console.log(`\n✨ Handoff button should ${hasTranscript ? '✅ APPEAR' : '❌ NOT APPEAR'}`);

        if (!hasTranscript) {
          console.log('⚠️  Missing transcript path!');
        }
      } else if (metadata.origin.platform === 'devin') {
        console.log(`Session ID: ${metadata.origin.sessionId}`);
      } else if (metadata.origin.platform === 'cursor') {
        console.log(`Conversation ID: ${metadata.origin.conversationId}`);
        console.log(`Generation ID: ${metadata.origin.generationId || 'N/A'}`);
      } else {
        console.log('Unknown platform - no additional data');
      }
    } else {
      console.log('❌ No origin metadata found');
      console.log('\n⚠️  This plan was likely created before origin metadata was implemented.');
      console.log('    The handoff button will NOT appear.');
    }

    // Raw metadata inspection
    console.log('\n🔧 Raw Metadata (for debugging):');
    console.log('─'.repeat(50));
    const metaMap = ydoc.getMap(YDOC_KEYS.METADATA);
    const rawData = metaMap.toJSON();
    console.log(JSON.stringify(rawData, null, 2));

    // Check all Y.Doc keys
    console.log('\n📦 Y.Doc Keys Present:');
    console.log('─'.repeat(50));
    console.log(`metadata: ${ydoc.getMap('metadata').size > 0 ? '✅' : '❌'}`);
    console.log(`document: ${ydoc.getXmlFragment('document').toString().length > 0 ? '✅' : '❌'}`);
    console.log(`content: ${ydoc.getArray('content').length > 0 ? '✅' : '❌'}`);
    console.log(`threads: ${ydoc.getMap('threads').size > 0 ? '✅' : '❌'}`);
    console.log(`artifacts: ${ydoc.getArray('artifacts').length > 0 ? '✅' : '❌'}`);
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
