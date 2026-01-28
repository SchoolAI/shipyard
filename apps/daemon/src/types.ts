/**
 * TypeScript types for daemon WebSocket protocol.
 * Protocol types are now exported from @shipyard/schema for sharing with web client.
 */

import type { ChildProcess } from 'node:child_process';

export type { ClientMessage, ServerMessage } from '@shipyard/schema';

export interface SpawnAgentOptions {
  taskId: string;
  prompt: string;
  cwd: string;
}

export interface ActiveAgent {
  taskId: string;
  process: ChildProcess;
  pid: number;
}
