import type { PersonalRoomClientMessage, PersonalRoomServerMessage } from './schemas';
import { PersonalRoomServerMessageSchema } from './schemas';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

interface MinimalWebSocket {
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface PersonalRoomConnectionConfig {
  url: string;
  WebSocketImpl?: new (url: string) => MinimalWebSocket;
}

export class PersonalRoomConnection {
  private state: ConnectionState = 'disconnected';
  private ws: MinimalWebSocket | null = null;
  private readonly messageHandlers = new Set<(msg: PersonalRoomServerMessage) => void>();
  private readonly stateChangeHandlers = new Set<(state: ConnectionState) => void>();
  private readonly config: PersonalRoomConnectionConfig;

  constructor(config: PersonalRoomConnectionConfig) {
    this.config = config;
  }

  getState(): ConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }

    const Impl = this.config.WebSocketImpl ?? (WebSocket as never);
    this.ws = new Impl(this.config.url);
    this.setState('connecting');

    this.ws.onopen = () => {
      this.setState('connected');
    };

    this.ws.onclose = () => {
      if (this.state !== 'error') {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = () => {
      this.setState('error');
    };

    this.ws.onmessage = (event: { data: string }) => {
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }

      const result = PersonalRoomServerMessageSchema.safeParse(raw);
      if (!result.success) {
        return;
      }

      for (const handler of this.messageHandlers) {
        handler(result.data);
      }
    };
  }

  send(msg: PersonalRoomClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  onMessage(handler: (msg: PersonalRoomServerMessage) => void): () => void {
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

  private setState(newState: ConnectionState): void {
    this.state = newState;
    for (const handler of this.stateChangeHandlers) {
      handler(newState);
    }
  }
}
