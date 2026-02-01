/**
 * Loro Shape definitions for Shipyard.
 *
 * Two document types:
 * 1. Task document (one per task)
 * 2. Task index document (one global doc for all tasks)
 */

import { type Infer, type InferMutableType, Shape } from '@loro-extended/change';

// ============================================================================
// TASK DOCUMENT SCHEMA
// ============================================================================

/**
 * Individual task document schema.
 * One doc per task, contains all task-specific state.
 *
 * Structure follows hybrid metadata pattern (from WorldStateSchema research):
 * - Root level: Core identity (id, title, status), content, and feature arrays
 * - meta struct: Auxiliary metadata (timestamps, ownership, tracking, etc.)
 */
export const TaskDocumentSchema = Shape.doc({
  // ============================================================================
  // CORE IDENTITY (root level)
  // ============================================================================

  // EXISTS: Unique task identifier (nanoid)
  // UI: URL routing, IndexedDB keys, React keys, panel selection
  // If removed: FATAL - cannot identify or navigate to tasks
  id: Shape.plain.string(),

  // EXISTS: Task title extracted from first heading
  // UI: PlanHeader, KanbanCard, Inbox, Search - all display titles
  // If removed: HIGH - tasks display as empty/unnamed
  title: Shape.plain.string(),

  // EXISTS: Workflow state (discriminator in Y.Doc)
  // UI: StatusChip colors, Kanban columns, Inbox filtering, Review actions
  // If removed: FATAL - entire workflow system breaks
  status: Shape.plain.string('draft', 'pending_review', 'changes_requested', 'in_progress', 'completed'),

  // ============================================================================
  // AUXILIARY METADATA (grouped in meta struct)
  // ============================================================================

  //
  // META - Auxiliary task metadata
  //
  // Contains: timestamps, ownership, tracking, archive state, origin info
  // Grouped separately from core identity (id, title, status) which are at root level
  //
  meta: Shape.struct({
    // === Timestamps ===

    // EXISTS: Creation timestamp
    // UI: Fallback for sorting (rarely displayed)
    // If removed: LOW - lose creation timestamp
    createdAt: Shape.plain.number(),

    // EXISTS: Last modification timestamp (auto-updated on every setTaskMetadata)
    // UI: "Updated 5 min ago", sorting, unread detection (compared to viewedBy)
    // If removed: HIGH - sorting breaks, unread indicators break
    updatedAt: Shape.plain.number(),

    // EXISTS (conditional): When task was completed
    // UI: Not prominently displayed
    // If removed: LOW - lose completion timestamp
    completedAt: Shape.plain.number().nullable(),

    // EXISTS (conditional): Who completed the task
    // UI: Not prominently displayed
    // If removed: LOW - lose completion attribution
    completedBy: Shape.plain.string().nullable(),

    // === Ownership ===

    // EXISTS: GitHub username who owns this task
    // UI: Owner avatar on KanbanCard, "My Tasks" vs "Shared" filtering
    // Server: Permission checks use getTaskOwnerId()
    // If removed: FATAL - ownership broken, permission system collapses
    //
    // FUTURE: Will become Shipyard internal user ID when adding auth system
    //   - Currently: GitHub username (e.g., "jacobpetterle")
    //   - Future: Shipyard user UUID, mapped to auth provider (GitHub, Google, email, etc.)
    //   - Migration: When adding auth, create User entity with internal ID
    ownerId: Shape.plain.string().nullable(),

    // === Session ===

    // EXISTS: CRDT schema version for breaking change detection
    // Server: Signaling rejects connections from outdated clients
    // If removed: MEDIUM - cannot force client upgrades on schema changes
    epoch: Shape.plain.number().nullable(),

    // === Origin Tracking ===

    // EXISTS: Platform metadata (discriminated union: claude-code, devin, cursor, browser, unknown)
    // UI: PlanHeader checks for transcript path for handoff feature
    // Stored as JSON.stringify(OriginMetadata)
    // If removed: MEDIUM - lose conversation handoff feature
    origin: Shape.plain.string().nullable(),

    // === GitHub Integration ===

    // EXISTS: GitHub repo (e.g., "owner/repo")
    // UI: PlanHeader displays repo name, required for artifact uploads
    // If removed: HIGH - GitHub integration breaks, no artifact uploads
    // Note: linkedPRs does NOT store repo - this is task-level metadata, keep it
    repo: Shape.plain.string().nullable(),

    // === Tags ===

    // EXISTS: Flexible categorization (e.g., ["ui", "bug", "project:mobile-app"])
    // UI: TagChips in PlanHeader, KanbanCard, Inbox; TagEditor; SearchPage filtering
    // If removed: MEDIUM - lose tagging/categorization feature
    tags: Shape.list(Shape.plain.string()),

    // === View Tracking ===

    // EXISTS: username → last viewed timestamp
    // UI: usePlanIndex isPlanUnread() comparison, inbox unread indicators
    // If removed: HIGH - lose inbox unread indicators
    viewedBy: Shape.record(Shape.plain.number()),

    // === Archive ===

    // EXISTS: When task was archived
    // UI: isArchived state, badge, filtered from active lists
    // If removed: HIGH - archive feature breaks
    archivedAt: Shape.plain.number().nullable(),

    // EXISTS: Who archived the task
    // UI: Not prominently displayed (audit trail)
    // If removed: LOW - lose archive attribution
    archivedBy: Shape.plain.string().nullable(),
  }),

  // ============================================================================
  // CORE CONTENT (root level)
  // ============================================================================

  //
  // CONTENT - Tiptap/ProseMirror document
  //
  // Y.Doc: YDOC_KEYS.DOCUMENT_FRAGMENT = "document" (Y.XmlFragment, BlockNote-managed)
  //
  // Current Architecture (BlockNote):
  //   - Creation: markdown → ServerBlockNoteEditor.tryParseMarkdownToBlocks() → blocksToYXmlFragment()
  //   - Reading: yXmlFragmentToBlocks() → blocksToMarkdownLossy()
  //   - Browser: BlockNoteView binds to Y.XmlFragment for collaborative editing
  //
  // Loro Migration:
  //   - Shape.any() because loro-prosemirror manages its own internal structure
  //   - Tiptap exports standard JSON (unlike BlockNote's opaque Y.XmlFragment)
  //   - All BlockNote helpers replaced with Tiptap equivalents
  //
  // UI: PlanViewer - the entire task content editor
  // If removed: FATAL - this IS the task content, app is completely non-functional
  // ASK: Please review the Laurel GitHub repo we've got cloned locally and um see if there's a type from the Laurel Prosmir that we can use here. 
  content: Shape.any(),

  //
  // COMMENTS - Unified comment storage (all comment types)
  //
  // Merges previously separate comment storage:
  //   - Inline comments (on task content blocks)
  //   - PR review comments (on GitHub PR diffs)
  //   - Local diff comments (on uncommitted changes)
  //   - Overall comments (global task-level feedback)
  //
  // Y.Doc: Previously split across threads, prReviewComments, localDiffComments
  // Loro: Unified commentId → comment with discriminated union by 'kind'
  //
  // UI: CommentGutter, ThreadCard, DiffCommentCard, overall review panel
  // If removed: FATAL - lose all commenting features
  //
  // commentId → comment data (discriminated by 'kind')
  //
  comments: Shape.record(
    Shape.plain.discriminatedUnion('kind', {
      // Inline comments on task content blocks
      inline: Shape.plain.struct({
        kind: Shape.plain.string('inline'),
        // Core fields (all comment types)
        id: Shape.plain.string(),
        threadId: Shape.plain.string(),
        body: Shape.plain.string(),
        author: Shape.plain.string(),
        createdAt: Shape.plain.number(),
        resolved: Shape.plain.boolean(),
        inReplyTo: Shape.plain.string().nullable(),
        // Inline-specific: links to content block
        blockId: Shape.plain.string(),
        selectedText: Shape.plain.string().nullable(),
      }),

      // PR review comments on GitHub PR diffs
      pr: Shape.plain.struct({
        kind: Shape.plain.string('pr'),
        // Core fields
        id: Shape.plain.string(),
        threadId: Shape.plain.string(),
        body: Shape.plain.string(),
        author: Shape.plain.string(),
        createdAt: Shape.plain.number(),
        resolved: Shape.plain.boolean(),
        inReplyTo: Shape.plain.string().nullable(),
        // PR-specific: which PR/file/line
        prNumber: Shape.plain.number(),
        path: Shape.plain.string(),
        line: Shape.plain.number(),
      }),

      // Local diff comments on uncommitted changes
      local: Shape.plain.struct({
        kind: Shape.plain.string('local'),
        // Core fields
        id: Shape.plain.string(),
        threadId: Shape.plain.string(),
        body: Shape.plain.string(),
        author: Shape.plain.string(),
        createdAt: Shape.plain.number(),
        resolved: Shape.plain.boolean(),
        inReplyTo: Shape.plain.string().nullable(),
        // Local-specific: file/line + staleness tracking
        path: Shape.plain.string(),
        line: Shape.plain.number(),
        baseRef: Shape.plain.string(),
        lineContentHash: Shape.plain.string(),
        machineId: Shape.plain.string().nullable(),
      }),

      // Overall task-level comments (not anchored to specific content)
      overall: Shape.plain.struct({
        kind: Shape.plain.string('overall'),
        // Core fields only - no anchoring
        id: Shape.plain.string(),
        threadId: Shape.plain.string(),
        body: Shape.plain.string(),
        author: Shape.plain.string(),
        createdAt: Shape.plain.number(),
        resolved: Shape.plain.boolean(),
        inReplyTo: Shape.plain.string().nullable(),
      }),
    })
  ),

  // REMOVED: stepCompletions - Unused feature (StepCheckbox.tsx never imported)
  // Native Tiptap checkboxes handle checkbox state in content
  // Only add back if separate completion tracking needed for activity timeline

  //
  // ARTIFACTS - Uploaded proof files
  //
  // Y.Doc: YDOC_KEYS.ARTIFACTS = "artifacts" - EXISTS
  // Helpers: getArtifacts(), addArtifact(), removeArtifact(), linkArtifactToDeliverable()
  //
  // Feature: Proof-of-work attachments that agents upload to demonstrate deliverable completion
  // Storage: CRDT stores METADATA only. Binary content stored separately:
  //   - github: raw.githubusercontent.com/{owner}/{repo}/plan-artifacts/plans/{planId}/{filename}
  //   - local: {SHIPYARD_STATE_DIR}/artifacts/{planId}/{filename}
  //
  // UI: Attachments grid, DeliverableCard preview, ArtifactRenderer (iframe/img/video)
  // If removed: FATAL - entire proof-of-work system breaks, no artifact uploads
  //
  // Types: html (test results, terminal output), image (screenshots), video (demos)
  // Storage: github (when GITHUB_TOKEN configured), local (fallback)
  //
  // Discriminated union by 'storage' - each variant has required storage-specific fields
  //
  artifacts: Shape.list(
    Shape.plain.discriminatedUnion('storage', {
      // GitHub-stored artifacts (raw.githubusercontent.com)
      github: Shape.plain.struct({
        storage: Shape.plain.string('github'),
        // Core fields (all artifacts)
        id: Shape.plain.string(),
        type: Shape.plain.string('html', 'image', 'video'),
        filename: Shape.plain.string(),
        description: Shape.plain.string().nullable(),
        uploadedAt: Shape.plain.number().nullable(),
        // GitHub-specific: full URL to raw content (REQUIRED)
        url: Shape.plain.string(),
      }),

      // Locally-stored artifacts (served from MCP server)
      local: Shape.plain.struct({
        storage: Shape.plain.string('local'),
        // Core fields (all artifacts)
        id: Shape.plain.string(),
        type: Shape.plain.string('html', 'image', 'video'),
        filename: Shape.plain.string(),
        description: Shape.plain.string().nullable(),
        uploadedAt: Shape.plain.number().nullable(),
        // Local-specific: path identifier "{planId}/{filename}" (REQUIRED)
        localArtifactId: Shape.plain.string(),
      }),
    })
  ),

  //
  // DELIVERABLES - Checkboxes marked with {#deliverable}
  //
  // Y.Doc: YDOC_KEYS.DELIVERABLES = "deliverables" - EXISTS and MATCHES
  // Helpers: getDeliverables(), addDeliverable(), linkArtifactToDeliverable()
  // Parser: deliverable-parser.ts extracts from BlockNote blocks via {#deliverable} marker
  //
  // Feature: Measurable outcomes that agents must PROVE with artifacts
  // Extraction: create-task parses content for `- [ ] Something {#deliverable}` markers
  // Linking: add_artifact with deliverableId sets linkedArtifactId
  // Auto-complete: When ALL deliverables have linkedArtifactId, task auto-completes
  //
  // UI: DeliverablesView tab, DeliverableCard, progress indicators ("2/3 deliverables")
  // If removed: FATAL - entire proof-of-work tracking system breaks
  //
  // vs stepCompletions: Steps = implementation checkboxes (any checkbox)
  //                     Deliverables = proof checkboxes (require artifact)
  // vs artifacts: Deliverables = expectations (what to prove)
  //               Artifacts = proof files (evidence)
  //
  deliverables: Shape.list(
    Shape.plain.struct({
      // EXISTS: BlockNote block ID of the checkbox with {#deliverable} marker
      // UI: React keys, artifact linking target, LLM output includes `{id="..."}`
      // If removed: FATAL - cannot link artifacts, cannot render lists
      id: Shape.plain.string(),

      // EXISTS: Checkbox text with {#deliverable} marker stripped
      // UI: Displayed as deliverable description in cards and modals
      // If removed: FATAL - deliverables have no description, feature useless
      text: Shape.plain.string(),

      // EXISTS: Artifact ID that proves this deliverable (set by linkArtifactToDeliverable)
      // UI: Determines completed vs pending status, shows checkmark, enables preview
      // Server: All fulfilled check triggers auto-complete
      // If removed: FATAL - cannot track completion, auto-complete never triggers
      linkedArtifactId: Shape.plain.string().nullable(),

      // EXISTS: Timestamp when artifact was linked
      // UI: Not currently displayed
      // If removed: LOW - lose audit trail, no current UI impact
      linkedAt: Shape.plain.number().nullable(),
    })
  ),

  //
  // EVENTS - Activity timeline
  //
  // Y.Doc: YDOC_KEYS.EVENTS = "events" - EXISTS
  // Type: Y.Array<TaskEvent> (discriminated union with ~24 event types)
  // Helpers: logTaskEvent(), getTaskEvents()
  //
  // Feature: Audit trail of all actions on a task
  // UI: ActivityTimeline grouped by day, ActivityEvent with type-specific rendering
  // If removed: HIGH - lose activity history, audit trail, inbox notifications
  //
  // Discriminated union by 'type' - each event has type-specific data fields
  //
  events: Shape.list(
    Shape.plain.discriminatedUnion('type', {
      // Task lifecycle events
      task_created: Shape.plain.struct({
        type: Shape.plain.string('task_created'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(), // string | string[] | null
      }),

      status_changed: Shape.plain.struct({
        type: Shape.plain.string('status_changed'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        // Status-specific data
        fromStatus: Shape.plain.string(),
        toStatus: Shape.plain.string(),
      }),

      completed: Shape.plain.struct({
        type: Shape.plain.string('completed'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
      }),

      task_archived: Shape.plain.struct({
        type: Shape.plain.string('task_archived'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
      }),

      task_unarchived: Shape.plain.struct({
        type: Shape.plain.string('task_unarchived'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
      }),

      // Review events
      approved: Shape.plain.struct({
        type: Shape.plain.string('approved'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        message: Shape.plain.string().nullable(),
      }),

      changes_requested: Shape.plain.struct({
        type: Shape.plain.string('changes_requested'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        message: Shape.plain.string().nullable(),
      }),

      // Comment events
      comment_added: Shape.plain.struct({
        type: Shape.plain.string('comment_added'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        commentId: Shape.plain.string(),
        threadId: Shape.plain.string().nullable(),
        preview: Shape.plain.string().nullable(),
      }),

      comment_resolved: Shape.plain.struct({
        type: Shape.plain.string('comment_resolved'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        commentId: Shape.plain.string(),
        threadId: Shape.plain.string().nullable(),
      }),

      // Artifact events
      artifact_uploaded: Shape.plain.struct({
        type: Shape.plain.string('artifact_uploaded'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        artifactId: Shape.plain.string(),
        filename: Shape.plain.string(),
        artifactType: Shape.plain.string().nullable(),
      }),

      deliverable_linked: Shape.plain.struct({
        type: Shape.plain.string('deliverable_linked'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        deliverableId: Shape.plain.string(),
        artifactId: Shape.plain.string(),
        deliverableText: Shape.plain.string().nullable(),
      }),

      // PR events
      pr_linked: Shape.plain.struct({
        type: Shape.plain.string('pr_linked'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        prNumber: Shape.plain.number(),
        title: Shape.plain.string().nullable(),
      }),

      pr_unlinked: Shape.plain.struct({
        type: Shape.plain.string('pr_unlinked'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        prNumber: Shape.plain.number(),
      }),

      // Content events
      content_edited: Shape.plain.struct({
        type: Shape.plain.string('content_edited'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        summary: Shape.plain.string().nullable(),
      }),

      // Input request events
      input_request_created: Shape.plain.struct({
        type: Shape.plain.string('input_request_created'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        requestId: Shape.plain.string(),
        message: Shape.plain.string(),
        isBlocker: Shape.plain.boolean().nullable(),
      }),

      input_request_answered: Shape.plain.struct({
        type: Shape.plain.string('input_request_answered'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        requestId: Shape.plain.string(),
      }),

      input_request_declined: Shape.plain.struct({
        type: Shape.plain.string('input_request_declined'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        requestId: Shape.plain.string(),
      }),

      input_request_cancelled: Shape.plain.struct({
        type: Shape.plain.string('input_request_cancelled'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        requestId: Shape.plain.string(),
      }),

      // Agent activity
      agent_activity: Shape.plain.struct({
        type: Shape.plain.string('agent_activity'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        message: Shape.plain.string(),
        isBlocker: Shape.plain.boolean().nullable(),
      }),

      // Tag events
      tag_added: Shape.plain.struct({
        type: Shape.plain.string('tag_added'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        tag: Shape.plain.string(),
      }),

      tag_removed: Shape.plain.struct({
        type: Shape.plain.string('tag_removed'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        tag: Shape.plain.string(),
      }),

      // Ownership events
      owner_changed: Shape.plain.struct({
        type: Shape.plain.string('owner_changed'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        fromOwner: Shape.plain.string().nullable(),
        toOwner: Shape.plain.string(),
      }),

      // Repo events
      repo_changed: Shape.plain.struct({
        type: Shape.plain.string('repo_changed'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        fromRepo: Shape.plain.string().nullable(),
        toRepo: Shape.plain.string(),
      }),

      // Title events
      title_changed: Shape.plain.struct({
        type: Shape.plain.string('title_changed'),
        id: Shape.plain.string(),
        actor: Shape.plain.string(),
        timestamp: Shape.plain.number(),
        inboxWorthy: Shape.plain.boolean().nullable(),
        inboxFor: Shape.plain.any(),
        fromTitle: Shape.plain.string(),
        toTitle: Shape.plain.string(),
      }),
    })
  ),

  //
  // LINKED_PRS - GitHub PR references
  //
  // Y.Doc: YDOC_KEYS.LINKED_PRS = "linkedPRs" - EXISTS
  // Helpers: getLinkedPRs(), linkPR(), unlinkPR(), getLinkedPR(), updateLinkedPRStatus()
  //
  // Feature: Track GitHub PRs associated with a task for diff viewing and review
  // Linking methods:
  //   1. Auto-link: complete_task/add-artifact detects current branch, queries GitHub API
  //   2. Manual MCP: link_pr tool with prNumber
  //   3. Manual UI: LinkPRButton component
  //
  // UI: ChangesView (PR cards, diff viewer), KanbanCard (PR count), PlanHeader
  // If removed: FATAL - no PR integration, cannot view diffs or leave review comments
  //
  // Relationship to prReviewComments: linkedPRs lists which PRs exist,
  //   prReviewComments stores inline comments referencing PRs by prNumber
  //
  linkedPRs: Shape.list(
    Shape.plain.struct({
      // EXISTS: GitHub PR number (e.g., 123 for PR #123)
      // UI: Displayed as "#123" in cards, used to match selected PR, filter comments
      // If removed: FATAL - entire PR linking system breaks
      prNumber: Shape.plain.number(),

      // REMOVED: url - Reconstruct dynamically as `https://github.com/${repo}/pull/${prNumber}`
      // Saves storage, always accurate, no sync needed

      // EXISTS: PR state from GitHub API (cached, not auto-fetched)
      // UI: Colored status chip (draft=gray, open=green, merged=purple, closed=red)
      // Server: Used to avoid linking closed/merged PRs during auto-link
      // If removed: HIGH - lose visual state indication, auto-link logic degraded
      //
      // Why cached not auto-fetched:
      //   - GitHub API rate limits (5000 req/hr authenticated, 60/hr unauthenticated)
      //   - Fetching on every render would be slow (network latency)
      //   - ChangesView refreshes from API on mount, updates CRDT if changed
      //   - Cached value prevents unnecessary API calls for unchanged PRs
      //
      // Alternative: Could fetch on-demand with staleness indicator if status is old
      status: Shape.plain.string('draft', 'open', 'merged', 'closed'),

      // REMOVED: linkedAt - Use pr_linked event timestamp instead
      // Activity log already records when PR was linked

      // NEW: Branch name (from Y.Doc optional field)
      // UI: Shows branch badge in PRCard
      // If removed: MINOR - lose context about which branch PR came from
      branch: Shape.plain.string().nullable(),

      // NEW: PR title (from Y.Doc optional field)
      // UI: Shows PR title instead of just "#123"
      // If removed: MODERATE - users see only numbers, need to click to GitHub
      title: Shape.plain.string().nullable(),
    })
  ),

  // REMOVED: inputRequests (per-task) - Merged to global only
  // Keep Y.Doc single-store pattern: ALL requests in TaskIndexSchema.inputRequests with optional taskId
  // Activity logging ensured: input_request_created and input_request_answered events
  // log to specific task doc for activity timeline display

  // NOTE: prReviewComments and localDiffComments have been merged into the unified
  // 'comments' field above using a discriminated union by 'kind'.
  // - PR comments: kind='pr' with prNumber, path, line
  // - Local diff comments: kind='local' with path, line, baseRef, lineContentHash, machineId
  // This eliminates duplicate schemas and provides type-safe comment handling.

  //
  // CHANGE_SNAPSHOTS - Machine-specific git diffs
  //
  // Enables collaborative review on uncommitted code
  changeSnapshots: Shape.record(Shape.plain.string()),  // machineId → JSON.stringify(ChangeSnapshot)

  // NOTE: snapshots removed - derived on-demand for URL generation, not stored in doc
  // NOTE: presence removed - use loro-extended ephemeral presence only
});

// ============================================================================
// TASK INDEX SCHEMA (Global Document)
// ============================================================================

/**
 * Global task index document schema.
 * One doc total, shared across all tasks for discovery and cross-task coordination.
 */
export const TaskIndexSchema = Shape.doc({
  // REMOVED: tasks - Rely on primary task docs instead of duplicating metadata
  // Research confirmed: Delta sync is tiny, IndexedDB caching makes this performant
  // Inbox/Kanban will load task docs on-demand (loro-extended supports selective sync)
  // Eliminates dual-write complexity and sync burden

  //
  // INPUT REQUESTS - User input from agents
  //
  // Y.Doc: YDOC_KEYS.INPUT_REQUESTS in plan-index doc - ALL requests stored globally
  // Loro: Same pattern - single global store with optional taskId for association
  //
  // Architecture (keeping Y.Doc pattern):
  //   - Removed TaskDocumentSchema.inputRequests (per-task split was unnecessary)
  //   - Keep all requests here with taskId field for task association
  //   - Browser connects to single doc, simpler queries, no aggregation
  //   - Activity events (input_request_created, input_request_answered) log to specific task docs
  //
  // UI: InputRequestModal, toast notifications, AgentRequestsBadge
  // If removed: FATAL - agents cannot request user input
  //
  // Discriminated union by 'type' - each input type has specific fields
  //
  inputRequests: Shape.list(
    Shape.plain.discriminatedUnion('type', {
      // Simple text input (single line)
      text: Shape.plain.struct({
        type: Shape.plain.string('text'),
        // Base fields (all input types)
        id: Shape.plain.string(),
        taskId: Shape.plain.string().nullable(),
        message: Shape.plain.string(),
        status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
        createdAt: Shape.plain.number(),
        expiresAt: Shape.plain.number(),
        response: Shape.plain.any(),
        answeredAt: Shape.plain.number().nullable(),
        answeredBy: Shape.plain.string().nullable(),
        isBlocker: Shape.plain.boolean().nullable(),
        // Text-specific
        defaultValue: Shape.plain.string().nullable(),
        placeholder: Shape.plain.string().nullable(),
      }),

      // Multi-line text input (textarea)
      multiline: Shape.plain.struct({
        type: Shape.plain.string('multiline'),
        // Base fields
        id: Shape.plain.string(),
        taskId: Shape.plain.string().nullable(),
        message: Shape.plain.string(),
        status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
        createdAt: Shape.plain.number(),
        expiresAt: Shape.plain.number(),
        response: Shape.plain.any(),
        answeredAt: Shape.plain.number().nullable(),
        answeredBy: Shape.plain.string().nullable(),
        isBlocker: Shape.plain.boolean().nullable(),
        // Multiline-specific
        defaultValue: Shape.plain.string().nullable(),
        placeholder: Shape.plain.string().nullable(),
      }),

      // Choice selection (radio/checkbox/dropdown)
      choice: Shape.plain.struct({
        type: Shape.plain.string('choice'),
        // Base fields
        id: Shape.plain.string(),
        taskId: Shape.plain.string().nullable(),
        message: Shape.plain.string(),
        status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
        createdAt: Shape.plain.number(),
        expiresAt: Shape.plain.number(),
        response: Shape.plain.any(),
        answeredAt: Shape.plain.number().nullable(),
        answeredBy: Shape.plain.string().nullable(),
        isBlocker: Shape.plain.boolean().nullable(),
        // Choice-specific (REQUIRED)
        options: Shape.plain.any(), // Array<{ label: string, value: string, description?: string }>
        // Choice-specific (optional)
        multiSelect: Shape.plain.boolean().nullable(),
        displayAs: Shape.plain.string('radio', 'checkbox', 'dropdown').nullable(),
        placeholder: Shape.plain.string().nullable(),
      }),

      // Yes/No confirmation
      confirm: Shape.plain.struct({
        type: Shape.plain.string('confirm'),
        // Base fields
        id: Shape.plain.string(),
        taskId: Shape.plain.string().nullable(),
        message: Shape.plain.string(),
        status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
        createdAt: Shape.plain.number(),
        expiresAt: Shape.plain.number(),
        response: Shape.plain.any(),
        answeredAt: Shape.plain.number().nullable(),
        answeredBy: Shape.plain.string().nullable(),
        isBlocker: Shape.plain.boolean().nullable(),
        // Confirm has no additional fields
      }),

      // Numeric input
      number: Shape.plain.struct({
        type: Shape.plain.string('number'),
        // Base fields
        id: Shape.plain.string(),
        taskId: Shape.plain.string().nullable(),
        message: Shape.plain.string(),
        status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
        createdAt: Shape.plain.number(),
        expiresAt: Shape.plain.number(),
        response: Shape.plain.any(),
        answeredAt: Shape.plain.number().nullable(),
        answeredBy: Shape.plain.string().nullable(),
        isBlocker: Shape.plain.boolean().nullable(),
        // Number-specific
        min: Shape.plain.number().nullable(),
        max: Shape.plain.number().nullable(),
        format: Shape.plain.string('integer', 'decimal', 'currency', 'percentage').nullable(),
        defaultValue: Shape.plain.number().nullable(),
      }),

      // Email input
      email: Shape.plain.struct({
        type: Shape.plain.string('email'),
        // Base fields
        id: Shape.plain.string(),
        taskId: Shape.plain.string().nullable(),
        message: Shape.plain.string(),
        status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
        createdAt: Shape.plain.number(),
        expiresAt: Shape.plain.number(),
        response: Shape.plain.any(),
        answeredAt: Shape.plain.number().nullable(),
        answeredBy: Shape.plain.string().nullable(),
        isBlocker: Shape.plain.boolean().nullable(),
        // Email-specific
        domain: Shape.plain.string().nullable(),
        placeholder: Shape.plain.string().nullable(),
      }),

      // Date picker
      date: Shape.plain.struct({
        type: Shape.plain.string('date'),
        // Base fields
        id: Shape.plain.string(),
        taskId: Shape.plain.string().nullable(),
        message: Shape.plain.string(),
        status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
        createdAt: Shape.plain.number(),
        expiresAt: Shape.plain.number(),
        response: Shape.plain.any(),
        answeredAt: Shape.plain.number().nullable(),
        answeredBy: Shape.plain.string().nullable(),
        isBlocker: Shape.plain.boolean().nullable(),
        // Date-specific
        min: Shape.plain.number().nullable(), // Unix timestamp
        max: Shape.plain.number().nullable(), // Unix timestamp
      }),

      // Rating input (1-5 stars, etc.)
      rating: Shape.plain.struct({
        type: Shape.plain.string('rating'),
        // Base fields
        id: Shape.plain.string(),
        taskId: Shape.plain.string().nullable(),
        message: Shape.plain.string(),
        status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
        createdAt: Shape.plain.number(),
        expiresAt: Shape.plain.number(),
        response: Shape.plain.any(),
        answeredAt: Shape.plain.number().nullable(),
        answeredBy: Shape.plain.string().nullable(),
        isBlocker: Shape.plain.boolean().nullable(),
        // Rating-specific
        min: Shape.plain.number().nullable(),
        max: Shape.plain.number().nullable(),
        ratingStyle: Shape.plain.string('stars', 'numbers', 'emoji').nullable(),
        ratingLabels: Shape.plain.any(), // { low?: string, high?: string }
      }),

      // Multi-question form
      multi: Shape.plain.struct({
        type: Shape.plain.string('multi'),
        // Base fields
        id: Shape.plain.string(),
        taskId: Shape.plain.string().nullable(),
        message: Shape.plain.string(),
        status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
        createdAt: Shape.plain.number(),
        expiresAt: Shape.plain.number(),
        response: Shape.plain.any(),
        answeredAt: Shape.plain.number().nullable(),
        answeredBy: Shape.plain.string().nullable(),
        isBlocker: Shape.plain.boolean().nullable(),
        // Multi-specific (REQUIRED)
        questions: Shape.plain.any(), // Array of nested question definitions
        // Multi-specific (optional)
        responses: Shape.plain.any(), // Record<questionId, answer>
      }),
    })
  ),

  // REMOVED: agents - Not used (changeSnapshots has machineId, WebRTC awareness has real-time presence)
  // Research confirmed: Diff per machine uses changeSnapshots, agent status uses WebRTC awareness
  // This was a new field with no actual consumers

  // REMOVED: viewedBy (global) - Keep only per-task viewedBy in TaskDocumentSchema.meta
  // User decision: "Only makes sense on the document level"
  // Inbox will load task docs to check unread status (performant with loro-extended selective sync)
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Task Document Types
export type TaskDocumentShape = typeof TaskDocumentSchema;
export type TaskDocument = Infer<typeof TaskDocumentSchema>;
export type MutableTaskDocument = InferMutableType<typeof TaskDocumentSchema>;
export type TaskMeta = Infer<typeof TaskDocumentSchema.shapes.meta>;

// Comment types (discriminated union by 'kind')
export type TaskComment = Infer<typeof TaskDocumentSchema.shapes.comments>;
// Individual comment variants can be extracted via TaskComment['inline'], etc.

// Event types (discriminated union by 'type')
export type TaskEvent = Infer<typeof TaskDocumentSchema.shapes.events>;
// Individual event variants can be extracted via TaskEvent['task_created'], etc.

// Artifact types (discriminated union by 'storage')
export type TaskArtifact = Infer<typeof TaskDocumentSchema.shapes.artifacts>;
// Variants: TaskArtifact['github'], TaskArtifact['local']

export type TaskDeliverable = Infer<typeof TaskDocumentSchema.shapes.deliverables>;
export type TaskLinkedPR = Infer<typeof TaskDocumentSchema.shapes.linkedPRs>;

// Task Index Types
export type TaskIndexShape = typeof TaskIndexSchema;
export type TaskIndex = Infer<typeof TaskIndexSchema>;
export type MutableTaskIndex = InferMutableType<typeof TaskIndexSchema>;

// Input request types (discriminated union by 'type')
export type InputRequest = Infer<typeof TaskIndexSchema.shapes.inputRequests>;
// Variants: InputRequest['text'], InputRequest['choice'], InputRequest['number'], etc.
