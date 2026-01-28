/**
 * TypeScript types for daemon WebSocket protocol
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

export interface SpawnAgentOptions {
  taskId: string;
  prompt: string;
  cwd: string;
}

export interface ActiveAgent {
  taskId: string;
  process: import('node:child_process').ChildProcess;
  pid: number;
}
