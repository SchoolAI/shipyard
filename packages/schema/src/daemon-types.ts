/**
 * TypeScript types for daemon WebSocket protocol.
 * Shared between daemon server and web client.
 */

export type ClientMessage =
  | { type: 'start-agent'; taskId: string; prompt: string; cwd?: string }
  | { type: 'stop-agent'; taskId: string }
  | { type: 'list-agents' };

export type ServerMessage =
  | { type: 'started'; taskId: string; pid: number }
  | { type: 'output'; taskId: string; data: string; stream: 'stdout' | 'stderr' }
  | { type: 'completed'; taskId: string; exitCode: number }
  | { type: 'stopped'; taskId: string }
  | { type: 'agents'; list: Array<{ taskId: string; pid: number }> }
  | { type: 'error'; taskId?: string; message: string };
