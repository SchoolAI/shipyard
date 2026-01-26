/**
 * tRPC context type definition.
 * The context provides dependencies to all tRPC procedures.
 *
 * Note: The actual context factory is implemented in the server package
 * since it requires server-specific dependencies (doc-store, subscriptions).
 * This file only defines the type contract.
 */

import type * as Y from 'yjs';
import type { LocalChangesResult } from '../local-changes.js';
import type { ConversationHandlers } from './routers/conversation.js';
import type { HookHandlers } from './routers/hook.js';
import type { ChangesResponse, SubscriptionCreateParams } from './schemas.js';

/**
 * Logger interface for dependency injection.
 * Compatible with pino logger but allows other implementations.
 */
export interface Logger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
  debug: (obj: object, msg?: string) => void;
}

/**
 * Plan store interface for subscription management.
 */
export interface PlanStore {
  createSubscription: (params: SubscriptionCreateParams) => string;
  getChanges: (planId: string, clientId: string) => ChangesResponse | null;
  deleteSubscription: (planId: string, clientId: string) => boolean;
  hasActiveConnections: (planId: string) => Promise<boolean>;
}

/**
 * Machine identity information for sync tracking.
 */
export interface MachineInfo {
  machineId: string;
  machineName: string;
  ownerId: string;
  cwd: string;
}

/**
 * tRPC context provided to all procedures.
 * Dependencies are injected by the server's context factory.
 */
export interface Context {
  /** Get or create a Y.Doc by plan ID */
  getOrCreateDoc: (planId: string) => Promise<Y.Doc>;
  /** Get the plan store for subscription management */
  getPlanStore: () => PlanStore;
  /** Logger instance */
  logger: Logger;
  /** Hook API handlers */
  hookHandlers: HookHandlers;
  /** Conversation import/export handlers */
  conversationHandlers: ConversationHandlers;
  /** Get local git changes for a working directory */
  getLocalChanges: (cwd: string) => LocalChangesResult;
  /** Get content of a file from a working directory */
  getFileContent: (cwd: string, filePath: string) => { content: string | null; error?: string };
  /** Get machine identity information */
  getMachineInfo: () => Promise<MachineInfo>;
}

/**
 * Context factory function type.
 * The server implements this to create context for each request.
 */
export type CreateContextFn = () => Context | Promise<Context>;
