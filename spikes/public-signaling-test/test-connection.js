#!/usr/bin/env node
/**
 * Test script for public y-webrtc signaling servers
 *
 * Tests connection, subscribe, ping/pong functionality
 *
 * Usage: node test-connection.js [server-url]
 * Default: wss://signaling.yjs.dev
 */

import WebSocket from 'ws';

const SERVERS = [
  'wss://signaling.yjs.dev',
  'wss://y-webrtc-signaling-us.herokuapp.com',
  'wss://y-webrtc-signaling-eu.herokuapp.com',
];

const TIMEOUT = 10000;

async function testServer(url) {
  console.log(`\n🔍 Testing: ${url}`);

  return new Promise((resolve) => {
    const results = {
      url,
      connected: false,
      pingPong: false,
      error: null,
      latency: null,
    };

    const startTime = Date.now();
    let ws;

    const timeout = setTimeout(() => {
      results.error = 'Connection timeout';
      if (ws) ws.close();
      resolve(results);
    }, TIMEOUT);

    try {
      ws = new WebSocket(url);

      ws.on('open', () => {
        results.connected = true;
        results.latency = Date.now() - startTime;
        console.log(`  ✅ Connected (${results.latency}ms)`);

        // Test subscribe
        ws.send(JSON.stringify({
          type: 'subscribe',
          topics: ['test-room-' + Date.now()]
        }));
        console.log('  ✅ Subscribe sent');

        // Test ping
        const pingStart = Date.now();
        ws.send(JSON.stringify({ type: 'ping' }));

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'pong') {
              results.pingPong = true;
              console.log(`  ✅ Ping/Pong works (${Date.now() - pingStart}ms)`);
              clearTimeout(timeout);
              ws.close();
              resolve(results);
            }
          } catch (e) {}
        });
      });

      ws.on('error', (err) => {
        results.error = err.message;
        console.log(`  ❌ Error: ${err.message}`);
        clearTimeout(timeout);
        resolve(results);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        resolve(results);
      });

    } catch (err) {
      results.error = err.message;
      clearTimeout(timeout);
      resolve(results);
    }
  });
}

async function main() {
  console.log('y-webrtc Public Signaling Server Test\n');

  const customUrl = process.argv[2];
  const serversToTest = customUrl ? [customUrl] : SERVERS;

  const results = [];
  for (const server of serversToTest) {
    const result = await testServer(server);
    results.push(result);
  }

  console.log('\n--- SUMMARY ---');
  for (const r of results) {
    const status = r.connected && r.pingPong ? '✅ WORKING' : '❌ FAILED';
    console.log(`${status}: ${r.url}`);
    if (r.error) console.log(`   Error: ${r.error}`);
  }

  const working = results.filter(r => r.connected && r.pingPong);
  if (working.length > 0) {
    console.log(`\nRECOMMENDATION: Use ${working[0].url}`);
  } else {
    console.log('\nRECOMMENDATION: No public servers working. Deploy your own.');
  }
}

main().catch(console.error);
