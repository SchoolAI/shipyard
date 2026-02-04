/**
 * WebSocket network adapter for Loro sync.
 *
 * Thin wrapper around @loro-extended/adapter-websocket.
 * Handles hook client connections for Loro document sync.
 * @see docs/whips/daemon-mcp-server-merge.md#4-use-loro-extended-adapters
 */

import { WsServerNetworkAdapter, wrapWsSocket } from '@loro-extended/adapter-websocket/server';
import { type PeerID, validatePeerId } from '@loro-extended/repo';
import {
  EPOCH_CLOSE_CODES,
  formatEpochCloseReason,
  isEpochValid,
  parseEpochParam,
} from '@shipyard/loro-schema';
import type { WebSocket, WebSocketServer } from 'ws';
import { getMinimumEpoch } from '../../utils/epoch-config.js';
import { logger } from '../../utils/logger.js';

export { WsServerNetworkAdapter, wrapWsSocket };

/**
 * Create a WebSocket adapter for Loro sync and attach it to a WebSocket server.
 * Handles incoming connections and wraps them for loro-extended.
 *
 * Validates client epoch against server minimum - rejects outdated clients
 * with close code 4100 so they clear their local storage and reconnect.
 */
export function createWebSocketAdapter(wss: WebSocketServer): WsServerNetworkAdapter {
  const adapter = new WsServerNetworkAdapter();

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const peerIdParam = url.searchParams.get('peerId');
    const clientEpoch = parseEpochParam(url.searchParams);

    let peerId: PeerID | undefined;
    if (peerIdParam) {
      try {
        validatePeerId(peerIdParam);
        peerId = peerIdParam;
      } catch {}
    }

    logger.debug({ peerId, clientEpoch, url: req.url }, 'WebSocket connection attempt');

    // Validate epoch before allowing sync - ALL clients must send a valid epoch
    const minimumEpoch = getMinimumEpoch();
    if (clientEpoch === null || !isEpochValid(clientEpoch, minimumEpoch)) {
      logger.info(
        { peerId, clientEpoch, minimumEpoch },
        clientEpoch === null
          ? 'Rejecting client without epoch'
          : 'Rejecting client with outdated epoch'
      );
      // Send the required epoch in the close reason so client knows what to use
      ws.close(EPOCH_CLOSE_CODES.EPOCH_TOO_OLD, formatEpochCloseReason(minimumEpoch));
      return;
    }

    try {
      const { connection, start } = adapter.handleConnection({
        socket: wrapWsSocket(ws),
        peerId,
      });

      logger.info(
        { peerId: connection.peerId, channelId: connection.channelId, clientEpoch },
        'WebSocket client connected'
      );

      start();
    } catch (error) {
      logger.error({ error, peerId, url: req.url }, 'Failed to handle WebSocket connection');
      ws.close(1011, 'Internal error handling connection');
    }
  });

  return adapter;
}
