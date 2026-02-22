/**
 * Integration test: Ephemeral state relay through hub-and-spoke topology.
 *
 * Validates that permission requests (permReqs) and responses (permResps)
 * flow correctly between daemon, owner browser, and collaborator browser
 * using loro-extended's built-in ephemeral relay mechanism.
 *
 * Topology:
 *   Daemon <--bridge1--> Owner Browser <--bridge2--> Collaborator Browser
 *
 * The owner's Repo has two adapters (one per bridge), so it acts as a
 * hub that relays ephemeral messages with hopsRemaining > 0 to all
 * other subscribed peers.
 */
import { Bridge, BridgeAdapter, Repo } from '@loro-extended/repo';
import {
  buildCollaboratorPermissions,
  PermissionRequestEphemeral,
  PermissionResponseEphemeral,
  parseDocumentId,
  TaskConversationDocumentSchema,
} from '@shipyard/loro-schema';
import { afterEach, describe, expect, it } from 'vitest';

const EPHEMERAL_DECLARATIONS = {
  permReqs: PermissionRequestEphemeral,
  permResps: PermissionResponseEphemeral,
};

const DOC_ID = 'task-conv:test-task-123:1';

/**
 * Helper to wait for ephemeral state propagation.
 * Uses a polling approach since ephemeral relay is async (microtask-based).
 */
async function waitFor(
  predicate: () => boolean,
  { timeout = 2000, interval = 20 } = {}
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeout}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

describe('Ephemeral collab relay (hub-and-spoke)', () => {
  const repos: Repo[] = [];

  afterEach(() => {
    for (const repo of repos) {
      repo.synchronizer.stopHeartbeat();
    }
    repos.length = 0;
  });

  function createTopology() {
    // Bridge 1: Daemon <-> Owner (personal room)
    const personalBridge = new Bridge();
    // Bridge 2: Owner <-> Collaborator (collab room)
    const collabBridge = new Bridge();

    const daemonPersonalAdapter = new BridgeAdapter({
      bridge: personalBridge,
      adapterType: 'daemon-personal',
    });

    const ownerPersonalAdapter = new BridgeAdapter({
      bridge: personalBridge,
      adapterType: 'owner-personal',
    });

    const ownerCollabAdapter = new BridgeAdapter({
      bridge: collabBridge,
      adapterType: 'owner-collab',
    });

    const collabCollabAdapter = new BridgeAdapter({
      bridge: collabBridge,
      adapterType: 'collab-collab',
    });

    // Daemon Repo: one adapter (personal bridge to owner)
    const daemonRepo = new Repo({
      identity: { name: 'daemon', type: 'user', peerId: '100' },
      adapters: [daemonPersonalAdapter],
    });
    repos.push(daemonRepo);

    // Owner Repo: two adapters (personal + collab)
    // Use permissive permissions for the test -- the real app uses buildDualPermissions
    // with the WebRTC adapter's hasDataChannel as the trust anchor. Here we use a
    // simpler permission set since BridgeAdapter lacks hasDataChannel.
    const sharedTaskIds = new Set(['test-task-123']);
    const ownerRepo = new Repo({
      identity: { name: 'owner', type: 'user', peerId: '200' },
      adapters: [ownerPersonalAdapter, ownerCollabAdapter],
      permissions: {
        visibility: (doc: { id: string }, peer: { channelKind: string }) => {
          if (peer.channelKind === 'storage') return true;
          // All documents visible (owner trusts both adapters in test)
          const parsed = parseDocumentId(doc.id);
          if (!parsed) return true;
          return (
            sharedTaskIds.has(parsed.key) || parsed.prefix === 'room' || parsed.prefix === 'epoch'
          );
        },
        mutability: () => true,
        creation: () => true,
        deletion: () => false,
      },
    });
    repos.push(ownerRepo);

    // Collaborator Repo: one adapter (collab bridge to owner)
    const collabRepo = new Repo({
      identity: { name: 'collaborator', type: 'user', peerId: '300' },
      adapters: [collabCollabAdapter],
      permissions: buildCollaboratorPermissions(),
    });
    repos.push(collabRepo);

    return { daemonRepo, ownerRepo, collabRepo };
  }

  it('relays permReqs from daemon to collaborator via owner', async () => {
    const { daemonRepo, ownerRepo, collabRepo } = createTopology();

    // All three repos get handles with ephemeral declarations
    const daemonHandle = daemonRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    const ownerHandle = ownerRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    const collabHandle = collabRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );

    // Wait for sync connections to establish
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Daemon writes a permission request
    daemonHandle.permReqs.set('tool-use-1', {
      toolName: 'Bash',
      toolInput: '{"command": "ls"}',
      riskLevel: 'medium',
      reason: null,
      blockedPath: null,
      description: 'List directory',
      agentId: null,
      createdAt: Date.now(),
    });

    // Owner should receive it via personal bridge
    await waitFor(() => {
      const val = ownerHandle.permReqs.get('tool-use-1');
      return val !== undefined;
    });

    expect(ownerHandle.permReqs.get('tool-use-1')).toMatchObject({
      toolName: 'Bash',
      riskLevel: 'medium',
    });

    // Collaborator should receive it via relay through owner
    await waitFor(() => {
      const val = collabHandle.permReqs.get('tool-use-1');
      return val !== undefined;
    });

    expect(collabHandle.permReqs.get('tool-use-1')).toMatchObject({
      toolName: 'Bash',
      riskLevel: 'medium',
      description: 'List directory',
    });
  });

  it('relays permResps from collaborator to daemon via owner', async () => {
    const { daemonRepo, ownerRepo, collabRepo } = createTopology();

    const daemonHandle = daemonRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    ownerRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    const collabHandle = collabRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Collaborator writes a permission response
    collabHandle.permResps.set('tool-use-1', {
      decision: 'approved',
      persist: false,
      message: null,
      decidedAt: Date.now(),
    });

    // Daemon should receive the response via relay through owner
    await waitFor(() => {
      const val = daemonHandle.permResps.get('tool-use-1');
      return val !== undefined;
    });

    expect(daemonHandle.permResps.get('tool-use-1')).toMatchObject({
      decision: 'approved',
      persist: false,
    });
  });

  it('completes full round-trip: daemon request -> collab response -> daemon receives', async () => {
    const { daemonRepo, ownerRepo, collabRepo } = createTopology();

    const daemonHandle = daemonRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    ownerRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    const collabHandle = collabRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Step 1: Daemon sends permission request
    daemonHandle.permReqs.set('tool-use-round-trip', {
      toolName: 'Write',
      toolInput: '{"file_path": "/tmp/test.txt"}',
      riskLevel: 'high',
      reason: null,
      blockedPath: '/tmp/test.txt',
      description: 'Write to file',
      agentId: null,
      createdAt: Date.now(),
    });

    // Step 2: Wait for collaborator to see the request
    await waitFor(() => {
      return collabHandle.permReqs.get('tool-use-round-trip') !== undefined;
    });

    // Step 3: Collaborator approves the request
    collabHandle.permResps.set('tool-use-round-trip', {
      decision: 'approved',
      persist: true,
      message: 'Looks good to me',
      decidedAt: Date.now(),
    });

    // Step 4: Daemon receives the response
    await waitFor(() => {
      return daemonHandle.permResps.get('tool-use-round-trip') !== undefined;
    });

    const response = daemonHandle.permResps.get('tool-use-round-trip');
    expect(response).toMatchObject({
      decision: 'approved',
      persist: true,
      message: 'Looks good to me',
    });
  });

  it('owner browser also sees both permReqs and permResps', async () => {
    const { daemonRepo, ownerRepo, collabRepo } = createTopology();

    const daemonHandle = daemonRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    const ownerHandle = ownerRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    const collabHandle = collabRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Daemon sends request
    daemonHandle.permReqs.set('tool-owner-test', {
      toolName: 'Edit',
      toolInput: '{}',
      riskLevel: 'medium',
      reason: null,
      blockedPath: null,
      description: null,
      agentId: null,
      createdAt: Date.now(),
    });

    // Owner should see it
    await waitFor(() => ownerHandle.permReqs.get('tool-owner-test') !== undefined);
    expect(ownerHandle.permReqs.get('tool-owner-test')?.toolName).toBe('Edit');

    // Collaborator responds
    await waitFor(() => collabHandle.permReqs.get('tool-owner-test') !== undefined);
    collabHandle.permResps.set('tool-owner-test', {
      decision: 'denied',
      persist: false,
      message: 'Not safe',
      decidedAt: Date.now(),
    });

    // Owner should see the response too
    await waitFor(() => ownerHandle.permResps.get('tool-owner-test') !== undefined);
    expect(ownerHandle.permResps.get('tool-owner-test')?.decision).toBe('denied');
  });

  it('multiple concurrent permission requests relay correctly', async () => {
    const { daemonRepo, ownerRepo, collabRepo } = createTopology();

    const daemonHandle = daemonRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    ownerRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );
    const collabHandle = collabRepo.get(
      DOC_ID,
      // eslint-disable-next-line no-restricted-syntax -- test uses explicit cast for generics
      TaskConversationDocumentSchema as never,
      EPHEMERAL_DECLARATIONS
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Daemon sends multiple concurrent requests
    daemonHandle.permReqs.set('tool-a', {
      toolName: 'Bash',
      toolInput: '{}',
      riskLevel: 'low',
      reason: null,
      blockedPath: null,
      description: null,
      agentId: null,
      createdAt: Date.now(),
    });
    daemonHandle.permReqs.set('tool-b', {
      toolName: 'Write',
      toolInput: '{}',
      riskLevel: 'high',
      reason: null,
      blockedPath: null,
      description: null,
      agentId: null,
      createdAt: Date.now(),
    });

    // Collaborator should see both
    await waitFor(() => {
      return (
        collabHandle.permReqs.get('tool-a') !== undefined &&
        collabHandle.permReqs.get('tool-b') !== undefined
      );
    });

    expect(collabHandle.permReqs.get('tool-a')?.toolName).toBe('Bash');
    expect(collabHandle.permReqs.get('tool-b')?.toolName).toBe('Write');

    // Respond to both
    collabHandle.permResps.set('tool-a', {
      decision: 'approved',
      persist: false,
      message: null,
      decidedAt: Date.now(),
    });
    collabHandle.permResps.set('tool-b', {
      decision: 'denied',
      persist: false,
      message: null,
      decidedAt: Date.now(),
    });

    // Daemon should see both responses
    await waitFor(() => {
      return (
        daemonHandle.permResps.get('tool-a') !== undefined &&
        daemonHandle.permResps.get('tool-b') !== undefined
      );
    });

    expect(daemonHandle.permResps.get('tool-a')?.decision).toBe('approved');
    expect(daemonHandle.permResps.get('tool-b')?.decision).toBe('denied');
  });
});
