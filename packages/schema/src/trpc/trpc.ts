/**
 * tRPC initialization for peer-plan.
 * Provides the base router and procedure builders.
 */

import { initTRPC } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
