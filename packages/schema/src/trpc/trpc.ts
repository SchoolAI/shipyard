/**
 * tRPC initialization for shipyard.
 * Provides the base router and procedure builders.
 */

import { initTRPC } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create({
  /**
   * Allow @trpc/server to be bundled in browser environments.
   * This is needed because the schema package exports router types that
   * get bundled into the web app for type inference.
   * The routers are never actually called in the browser - only the types are used.
   * See: https://trpc.io/docs/server/routers
   */
  allowOutsideOfServer: true,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
