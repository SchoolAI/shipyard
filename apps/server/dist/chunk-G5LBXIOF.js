import {
  logger
} from "./chunk-64LGVSCH.js";

// src/session-registry.ts
function isSessionStateCreated(state) {
  return state.lifecycle === "created";
}
function isSessionStateSynced(state) {
  return state.lifecycle === "synced";
}
function isSessionStateApprovedAwaitingToken(state) {
  return state.lifecycle === "approved_awaiting_token";
}
function isSessionStateApproved(state) {
  return state.lifecycle === "approved";
}
function isSessionStateReviewed(state) {
  return state.lifecycle === "reviewed";
}
function assertNever(value) {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}
var sessions = /* @__PURE__ */ new Map();
var planToSession = /* @__PURE__ */ new Map();
var DEFAULT_TTL_MS = 60 * 60 * 1e3;
function getSessionState(sessionId) {
  return sessions.get(sessionId) ?? null;
}
function touchSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastSyncedAt = Date.now();
  }
}
function setSessionState(sessionId, state) {
  const updatedState = {
    ...state,
    lastSyncedAt: Date.now()
  };
  sessions.set(sessionId, updatedState);
  planToSession.set(updatedState.planId, sessionId);
}
function deleteSessionState(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    planToSession.delete(session.planId);
  }
  sessions.delete(sessionId);
}
function getSessionStateByPlanId(planId) {
  const sessionId = planToSession.get(planId);
  if (!sessionId) return null;
  return getSessionState(sessionId);
}
function getSessionIdByPlanId(planId) {
  return planToSession.get(planId) || null;
}
function cleanStaleSessions(ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now();
  let cleaned = 0;
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastSyncedAt > ttlMs) {
      const currentSessionId = planToSession.get(session.planId);
      if (currentSessionId === sessionId) {
        planToSession.delete(session.planId);
      }
      sessions.delete(sessionId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.info({ cleaned, ttlMs }, "Cleaned stale sessions from registry");
  }
  return cleaned;
}
function getActiveSessions() {
  return Array.from(sessions.keys());
}
function getSessionCount() {
  return sessions.size;
}
var cleanupInterval = null;
function startPeriodicCleanup(intervalMs = 15 * 60 * 1e3) {
  if (cleanupInterval) {
    logger.warn("Periodic cleanup already started");
    return;
  }
  cleanupInterval = setInterval(() => {
    cleanStaleSessions();
  }, intervalMs);
  logger.info({ intervalMs }, "Started periodic session cleanup");
}
function stopPeriodicCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("Stopped periodic session cleanup");
  }
}

export {
  isSessionStateCreated,
  isSessionStateSynced,
  isSessionStateApprovedAwaitingToken,
  isSessionStateApproved,
  isSessionStateReviewed,
  assertNever,
  getSessionState,
  touchSession,
  setSessionState,
  deleteSessionState,
  getSessionStateByPlanId,
  getSessionIdByPlanId,
  cleanStaleSessions,
  getActiveSessions,
  getSessionCount,
  startPeriodicCleanup,
  stopPeriodicCleanup
};
