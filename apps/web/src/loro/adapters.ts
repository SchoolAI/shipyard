import { IndexedDBStorageAdapter } from '@loro-extended/adapter-indexeddb';
import { WsClientNetworkAdapter } from '@loro-extended/adapter-websocket/client';
import { nanoid } from 'nanoid';
import { getWebRtcAdapter } from './webrtc';

function getWsUrl(): string {
  const port = import.meta.env.VITE_WS_PORT || '4445';
  const isSecure = window.location.protocol === 'https:';
  const protocol = isSecure ? 'wss:' : 'ws:';
  const host = import.meta.env.DEV ? 'localhost' : window.location.host;
  return `${protocol}//${host}:${port}/ws`;
}

function getPeerId(): string {
  const key = 'shipyard-peer-id';
  let peerId = localStorage.getItem(key);
  if (!peerId) {
    peerId = nanoid();
    localStorage.setItem(key, peerId);
  }
  return peerId;
}

const peerId = getPeerId();
const wsUrl = `${getWsUrl()}?peerId=${peerId}`;

export const wsAdapter = new WsClientNetworkAdapter({
  url: wsUrl,
  reconnect: {
    enabled: true,
    maxAttempts: 10,
    baseDelay: 1000,
    maxDelay: 30000,
  },
  keepaliveInterval: 30000,
});

export const storageAdapter = new IndexedDBStorageAdapter();

export const webRtcAdapter = getWebRtcAdapter();

export const loroAdapters = [storageAdapter, wsAdapter, webRtcAdapter];
