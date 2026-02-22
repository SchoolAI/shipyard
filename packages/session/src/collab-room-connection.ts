import type { ConnectionState } from './personal-room-connection';
import type { CollabRoomClientMessage, CollabRoomServerMessage } from './schemas';
import { CollabRoomServerMessageSchema } from './schemas';

interface MinimalWebSocket {
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface CollabRoomConnectionConfig {
  url: string;
  WebSocketImpl?: new (url: string) => MinimalWebSocket;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export class CollabRoomConnection {
  private state: ConnectionState = 'disconnected';
  private ws: MinimalWebSocket | null = null;
  private readonly messageHandlers = new Set<(msg: CollabRoomServerMessage) => void>();
  private readonly stateChangeHandlers = new Set<(state: ConnectionState) => void>();
  private readonly config: CollabRoomConnectionConfig;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;

  constructor(config: CollabRoomConnectionConfig) {
    this.config = config;
  }

  getState(): ConnectionState {
    return this.state;
  }

  connect(): void {
    this.intentionalDisconnect = false;

    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }

    const Impl = this.config.WebSocketImpl ?? (WebSocket as never);
    try {
      this.ws = new Impl(this.config.url);
    } catch {
      this.setState('error');
      this.reconnectWithBackoff();
      return;
    }
    this.setState('connecting');

    this.ws.onopen = () => {
      this.setState('connected');
    };

    this.ws.onclose = () => {
      if (this.state !== 'error' && this.state !== 'reconnecting') {
        this.setState('disconnected');
      }
      if (!this.intentionalDisconnect) {
        this.reconnectWithBackoff();
      }
    };

    this.ws.onerror = () => {
      this.setState('error');
      if (!this.intentionalDisconnect) {
        this.reconnectWithBackoff();
      }
    };

    this.ws.onmessage = (event: { data: string }) => {
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }

      const result = CollabRoomServerMessageSchema.safeParse(raw);
      if (!result.success) {
        return;
      }

      for (const handler of [...this.messageHandlers]) {
        handler(result.data);
      }
    };
  }

  send(msg: CollabRoomClientMessage): void {
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch {
      /** WebSocket may be in CLOSING/CLOSED state */
    }
  }

  onMessage(handler: (msg: CollabRoomServerMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateChangeHandlers.add(handler);
    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.retryCount = 0;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  private reconnectWithBackoff(): void {
    if (this.retryTimer !== null) return;

    const maxRetries = this.config.maxRetries;
    if (maxRetries === undefined || maxRetries === 0) {
      return;
    }

    if (maxRetries !== -1 && this.retryCount >= maxRetries) {
      return;
    }

    this.setState('reconnecting');

    if (this.intentionalDisconnect) return;

    const initialDelay = this.config.initialDelayMs ?? 1000;
    const maxDelay = this.config.maxDelayMs ?? 30000;
    const multiplier = this.config.backoffMultiplier ?? 2;
    const delay = Math.min(initialDelay * multiplier ** this.retryCount, maxDelay);

    this.retryCount++;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private setState(newState: ConnectionState): void {
    this.state = newState;
    if (newState === 'connected') {
      this.retryCount = 0;
    }
    for (const handler of [...this.stateChangeHandlers]) {
      handler(newState);
    }
  }
}
