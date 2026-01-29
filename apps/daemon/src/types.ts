/**
 * TypeScript types for daemon WebSocket protocol.
 * Protocol types are now exported from @shipyard/schema for sharing with web client.
 */

import type { ChildProcess } from 'node:child_process';
import type { A2AMessage, ConversationExportMeta } from '@shipyard/schema';

export type { ClientMessage, ServerMessage } from '@shipyard/schema';

export interface SpawnAgentOptions {
  taskId: string;
  prompt: string;
  cwd: string;
}

export interface SpawnWithContextOptions {
  taskId: string;
  cwd: string;
  a2aPayload: {
    messages: A2AMessage[];
    meta: ConversationExportMeta;
  };
}

export interface ActiveAgent {
  taskId: string;
  process: ChildProcess;
  pid: number;
}
