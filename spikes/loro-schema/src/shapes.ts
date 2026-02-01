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
 */
export const TaskDocumentSchema = Shape.doc({
  //
  // METADATA - Core task info, status, ownership, permissions
  //
  // Y.Doc: YDOC_KEYS.METADATA = "metadata" - EXISTS
  // Helpers: getPlanMetadata(), setPlanMetadata(), transitionPlanStatus()
  // Type: PlanMetadataSchema (discriminated union on status)
  //
  // UI: Powers almost everything - headers, status, kanban, permissions, archive
  // If removed: FATAL - task state completely lost
  //
  meta: Shape.struct({
    // === Core Identity ===

    // EXISTS: Unique task identifier (nanoid)
    // UI: URL routing, IndexedDB keys, React keys, panel selection
    // If removed: FATAL - cannot identify or navigate to tasks
    id: Shape.plain.string(),

    // EXISTS: Task title extracted from first heading
    // UI: PlanHeader, KanbanCard, Inbox, Search - all display titles
    // If removed: HIGH - tasks display as empty/unnamed
    title: Shape.plain.string(),

    // === Timestamps ===

    // EXISTS: Creation timestamp
    // UI: Fallback for sorting (rarely displayed)
    // If removed: LOW - lose creation timestamp
    createdAt: Shape.plain.number(),

    // EXISTS: Last modification timestamp (auto-updated on every setPlanMetadata)
    // UI: "Updated 5 min ago", sorting, unread detection (compared to viewedBy)
    // If removed: HIGH - sorting breaks, unread indicators break
    updatedAt: Shape.plain.number(),

    // === Status Tracking ===

    // EXISTS: Workflow state (discriminator in Y.Doc)
    // UI: StatusChip colors, Kanban columns, Inbox filtering, Review actions
    // If removed: FATAL - entire workflow system breaks
    status: Shape.plain.string('draft', 'pending_review', 'changes_requested', 'in_progress', 'completed'),

    // EXISTS (conditional): Generated on waitForApproval, matched when approved
    // UI: Not displayed, prevents stale approvals from previous review cycles
    // If removed: HIGH - race conditions in approval flow
    reviewRequestId: Shape.plain.string().nullable(),

    // EXISTS (conditional): When review decision was made
    // UI: Not prominently displayed (audit timestamp)
    // If removed: LOW - lose review timestamp
    reviewedAt: Shape.plain.number().nullable(),

    // EXISTS (conditional): Who made review decision
    // UI: Attribution in feedback context, returned to agent
    // If removed: MEDIUM - lose reviewer attribution
    reviewedBy: Shape.plain.string().nullable(),

    // EXISTS (conditional): Overall review comment (not inline)
    // UI: Displayed in feedback section, returned to agent
    // If removed: MEDIUM - reviewers cannot leave overall comments
    reviewComment: Shape.plain.string().nullable(),

    // EXISTS (conditional): When task was completed
    // UI: Not prominently displayed
    // If removed: LOW - lose completion timestamp
    completedAt: Shape.plain.number().nullable(),

    // EXISTS (conditional): Who completed the task
    // UI: Not prominently displayed
    // If removed: LOW - lose completion attribution
    completedBy: Shape.plain.string().nullable(),

    // EXISTS (conditional): Generated URL for PR embedding
    // UI: CopySnapshotUrlButton in PlanHeader
    // If removed: MEDIUM - cannot embed snapshot URLs in PRs
    snapshotUrl: Shape.plain.string().nullable(),

    // === GitHub Integration ===

    // EXISTS: GitHub repo (e.g., "owner/repo")
    // UI: PlanHeader displays repo name, required for artifact uploads
    // If removed: HIGH - GitHub integration breaks, no artifact uploads
    repo: Shape.plain.string().nullable(),

    // EXISTS: PR number linked to task
    // UI: PlanHeader shows "#123", used in artifact storage path
    // If removed: HIGH - artifact storage paths break
    pr: Shape.plain.number().nullable(),

    // === Ownership ===

    // EXISTS: GitHub username who owns this task
    // UI: Owner avatar on KanbanCard, "My Tasks" vs "Shared" filtering
    // Server: Permission checks use getPlanOwnerId()
    // If removed: FATAL - ownership broken, permission system collapses
    ownerId: Shape.plain.string().nullable(),

    // === Permissions (Simple Approval Model) ===

    // EXISTS: Whether waiting room gate is required
    // UI: Controls waiting room display
    // If removed: MEDIUM - all plans become open access
    approvalRequired: Shape.plain.boolean().nullable(),

    // EXISTS: Users granted access (auto-includes ownerId)
    // UI: ApprovalPanel, WaitingRoomGate checks
    // If removed: HIGH - shared access permission system breaks
    approvedUsers: Shape.list(Shape.plain.string()),

    // EXISTS: Users permanently denied access
    // UI: ApprovalPanel deny button, shows "access denied" message
    // If removed: MEDIUM - cannot permanently deny users
    rejectedUsers: Shape.list(Shape.plain.string()),

    // === Archive ===

    // EXISTS: When task was archived
    // UI: isArchived state, badge, filtered from active lists
    // If removed: HIGH - archive feature breaks
    archivedAt: Shape.plain.number().nullable(),

    // EXISTS: Who archived the task
    // UI: Not prominently displayed (audit trail)
    // If removed: LOW - lose archive attribution
    archivedBy: Shape.plain.string().nullable(),

    // === Session ===

    // EXISTS: CRDT schema version for breaking change detection
    // Server: Signaling rejects connections from outdated clients
    // If removed: MEDIUM - cannot force client upgrades on schema changes
    epoch: Shape.plain.number().nullable(),

    // EXISTS: SHA256 hash of session token (NOT raw token)
    // Server: MCP tool authentication verification
    // If removed: HIGH - MCP tools lose auth, any agent could modify any task
    sessionTokenHash: Shape.plain.string().nullable(),

    // === Origin Tracking ===

    // EXISTS: Platform metadata (discriminated union: claude-code, devin, cursor, browser, unknown)
    // UI: PlanHeader checks for transcript path for handoff feature
    // Stored as JSON.stringify(OriginMetadata)
    // If removed: MEDIUM - lose conversation handoff feature
    origin: Shape.plain.string().nullable(),

    // === View Tracking ===

    // EXISTS: username → last viewed timestamp
    // UI: usePlanIndex isPlanUnread() comparison, inbox unread indicators
    // If removed: HIGH - lose inbox unread indicators
    //
    // ⚠️ DUPLICATIVE: Also exists in TaskIndexSchema.viewedBy (global nested version)
    //   - Here: per-task viewedBy when task doc is loaded
    //   - TaskIndexSchema: global taskId → (username → timestamp) for inbox without loading docs
    //   - Y.Doc has BOTH for different access patterns (per-doc vs plan-index)
    //   - Consider: Do we need both in Loro, or can plan-index be single source of truth?
    //
    viewedBy: Shape.record(Shape.plain.number()),

    // === Conversation Versions ===

    // EXISTS: Provenance tracking for conversation handoffs
    // Stored as JSON.stringify(ConversationVersion[])
    // UI: Not directly displayed (provenance tracking)
    // If removed: MEDIUM - lose conversation handoff provenance
    conversationVersions: Shape.plain.string().nullable(),

    // === Tags ===

    // EXISTS: Flexible categorization (e.g., ["ui", "bug", "project:mobile-app"])
    // UI: TagChips in PlanHeader, KanbanCard, Inbox; TagEditor; SearchPage filtering
    // If removed: MEDIUM - lose tagging/categorization feature
    tags: Shape.list(Shape.plain.string()),
  }),

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
  // UI: PlanViewer - the entire plan content editor
  // If removed: FATAL - this IS the plan content, app is completely non-functional
  //
  content: Shape.any(),

  //
  // COMMENTS - Thread storage (replaces BlockNote's YjsThreadStore)
  //
  // Y.Doc: YDOC_KEYS.THREADS = "threads" - DIFFERENT STRUCTURE
  //   Current: Y.Map<threadId, Thread> where Thread = { id, comments: [], resolved, selectedText }
  //   Loro: Flat commentId → comment, with threadId field to group
  //
  // Migration: Flattens nested thread structure. Each comment is top-level entry
  // with threadId field to link them. Denormalization for simpler CRDT operations.
  //
  // UI: CommentGutter, ThreadCard - inline comments on plan content
  // If removed: HIGH - lose inline commenting feature
  //
  // commentId → comment data
  comments: Shape.record(
    Shape.struct({
      // EXISTS (as ThreadComment.id): Unique comment identifier
      // UI: React keys, toast IDs, reply targeting
      // If removed: FATAL - cannot identify comments
      id: Shape.plain.string(),

      // NEW (implicit in Y.Doc via nesting): Groups comments into threads
      // UI: Renders comments as threaded conversation
      // If removed: FATAL - cannot group comments into threads
      threadId: Shape.plain.string(),

      // EXISTS (as ThreadComment.body): Comment text content
      // UI: Displayed in ThreadCard, formatted for LLM export
      // If removed: FATAL - comments have no content
      body: Shape.plain.string(),

      // EXISTS (as ThreadComment.userId): Who wrote the comment
      // UI: Avatar, initials, color, display name, delete permission
      // If removed: HIGH - no attribution, delete permission breaks
      author: Shape.plain.string(),

      // EXISTS: When comment was created
      // UI: "2h ago" relative time, chronological sorting
      // If removed: MEDIUM - no timestamp, ordering breaks
      createdAt: Shape.plain.number(),

      // EXISTS (at Thread level in Y.Doc): Whether feedback is addressed
      // UI: Checkbox toggle, green styling, strikethrough, LLM filter
      // Migration note: Moved from thread level to comment level
      // If removed: HIGH - cannot track addressed feedback
      resolved: Shape.plain.boolean(),

      // EXISTS (as anchorBlockId custom extension): Links comment to content block
      // UI: Positions ThreadCard at correct Y-coordinate, "click to scroll"
      // If removed: HIGH - comments become unanchored, lose inline display
      blockId: Shape.plain.string().nullable(),

      // EXISTS (as Thread.selectedText): Text that was highlighted
      // UI: Quoted text in ThreadHeader for context
      // If removed: MEDIUM - lose context about what was commented on
      selectedText: Shape.plain.string().nullable(),
    })
  ),

  //
  // STEP_COMPLETIONS - Track which implementation steps are done
  //
  // Y.Doc: YDOC_KEYS.STEP_COMPLETIONS = "stepCompletions" - EXISTS but UNUSED
  // Helpers: getStepCompletions(), toggleStepCompletion(), isStepCompleted()
  //
  // DISCOVERY: StepCheckbox.tsx component EXISTS but is NOT USED anywhere!
  //   - No files import StepCheckbox
  //   - PlanViewer renders native BlockNote checkboxes
  //   - The Y.Map exists but is orphaned (written but never read in UI)
  //   - The step_completed event type is never logged
  //
  // Purpose: Track checkbox completion separately from document content
  // stepId = BlockNote block ID of the checkbox
  //
  // vs deliverables:
  //   - Steps = ANY checkbox in plan content (implementation tasks)
  //   - Deliverables = checkboxes marked {#deliverable} (require artifact proof)
  //
  // If removed: LOW - feature is not actually used, safe to remove
  // Alternative: Keep for future use, just needs StepCheckbox integration
  //
  // stepId → completed (boolean)
  stepCompletions: Shape.record(Shape.plain.boolean()),

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
  // Note: Y.Doc uses Zod discriminated union by storage type. Loro uses flat struct
  // with all nullable - loses type safety but simplifies schema.
  //
  artifacts: Shape.list(
    Shape.plain.struct({
      // EXISTS: Unique identifier (nanoid)
      // UI: React keys, artifact selection, deliverable linking
      // If removed: FATAL - cannot identify artifacts for any operation
      id: Shape.plain.string(),

      // EXISTS: Content type determining rendering strategy
      // UI: ArtifactRenderer switches between iframe/img/video based on type
      // If removed: FATAL - cannot determine how to render artifact
      type: Shape.plain.string('html', 'image', 'video'),

      // EXISTS: Original filename with extension
      // UI: Displayed in Attachments header, DeliverableCard
      // Server: Used for GitHub/local storage path, extension validation
      // If removed: FATAL - cannot display name or determine storage path
      filename: Shape.plain.string(),

      // EXISTS: Optional human-readable description
      // UI: Shows as primary display name if set, otherwise falls back to filename
      // If removed: LOW - display falls back to filename
      description: Shape.plain.string().nullable(),

      // EXISTS: Discriminant for storage location
      // UI: ArtifactRenderer switches between LocalArtifactViewer and GitHub fetch
      // If removed: FATAL - cannot determine which URL/access mechanism to use
      storage: Shape.plain.string('github', 'local'),

      // EXISTS (github only): Full URL to raw.githubusercontent.com
      // UI: Passed to viewers for GitHub artifacts
      // If removed: FATAL for github storage - cannot load artifacts
      url: Shape.plain.string().nullable(),

      // EXISTS (local only): Path identifier "{planId}/{filename}"
      // UI: Used to build localhost URL for local artifacts
      // If removed: FATAL for local storage - cannot serve artifacts
      localArtifactId: Shape.plain.string().nullable(),

      // EXISTS: Unix timestamp when uploaded
      // UI: DeliverableCard shows "Attached 5 min ago"
      // If removed: LOW - lose timestamp display, minor UX degradation
      uploadedAt: Shape.plain.number().nullable(),
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
  // Type: Y.Array<PlanEvent> (discriminated union with ~24 event types)
  // Helpers: logPlanEvent(), getPlanEvents()
  //
  // Feature: Audit trail of all actions on a task
  // UI: ActivityTimeline grouped by day, ActivityEvent with type-specific rendering
  // If removed: HIGH - lose activity history, audit trail, inbox notifications
  //
  // Event Types (not exhaustive):
  //   plan_created, status_changed, comment_added, comment_resolved,
  //   artifact_uploaded, deliverable_linked, pr_linked, content_edited,
  //   approved, changes_requested, completed, input_request_created,
  //   input_request_answered, agent_activity, plan_archived, etc.
  //
  // Note: Y.Doc uses discriminated union with type-safe data payloads.
  // Loro uses plain strings - loses compile-time validation, requires parse at boundaries.
  //
  // MISSING optional fields from Y.Doc: inboxWorthy, inboxFor
  //   - inboxWorthy: boolean - determines if event appears in inbox notifications
  //   - inboxFor: string | string[] - targets specific users ("owner" or username array)
  //   Consider adding these or including in data JSON.
  //
  events: Shape.list(
    Shape.plain.struct({
      // EXISTS: Unique event identifier
      // UI: React keys, useInboxEvents unread tracking (isEventUnread())
      // If removed: FATAL - cannot render event lists, cannot track read state
      id: Shape.plain.string(),

      // EXISTS: Event type (discriminator in Y.Doc)
      // UI: Determines icon, description, special rendering (blocker badges, markdown)
      // If removed: FATAL - cannot determine how to display events
      // Note: Loro loses type safety - accepts any string vs Y.Doc's literal union
      type: Shape.plain.string(),

      // EXISTS: Who performed the action (username or agent name)
      // UI: Bold prefix in timeline: "{actor} {description}"
      // If removed: HIGH - events have no attribution
      actor: Shape.plain.string(),

      // EXISTS: When event occurred (Unix ms)
      // UI: Sorting, day grouping (Today/Yesterday/This Week), "5 min ago" display
      // If removed: FATAL - cannot sort or display event times
      timestamp: Shape.plain.number(),

      // EXISTS: Event-specific data payload
      // Y.Doc: Type-safe per event type (e.g., status_changed has fromStatus/toStatus)
      // Loro: JSON.stringify for discriminated union support
      // UI: Event-type-specific rendering (PR numbers, messages, status transitions)
      // If removed: HIGH - events lose contextual details
      data: Shape.plain.string(),
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
  // MISSING from Y.Doc: branch (shows branch name), title (PR title for display)
  //   Consider adding these for better UX without GitHub API calls
  //
  linkedPRs: Shape.list(
    Shape.plain.struct({
      // EXISTS: GitHub PR number (e.g., 123 for PR #123)
      // UI: Displayed as "#123" in cards, used to match selected PR, filter comments
      // If removed: FATAL - entire PR linking system breaks
      prNumber: Shape.plain.number(),

      // EXISTS: Full GitHub PR URL
      // UI: Not directly displayed (UI reconstructs from repo + prNumber)
      // Server: Logged in events, returned in MCP tool output
      // If removed: MINOR - can reconstruct from repo + prNumber
      url: Shape.plain.string().nullable(),

      // EXISTS: PR state from GitHub API
      // UI: Colored status chip (draft=gray, open=green, merged=purple, closed=red)
      // Server: Used to avoid linking closed/merged PRs during auto-link
      // If removed: HIGH - lose visual state indication, auto-link logic degraded
      status: Shape.plain.string('draft', 'open', 'merged', 'closed'),

      // EXISTS: Timestamp when PR was linked
      // UI: Formatted in MCP tool output, not prominently displayed
      // If removed: MINOR - lose audit trail of when linked
      linkedAt: Shape.plain.number(),
    })
  ),

  //
  // INPUT_REQUESTS - User input from agents (per-task)
  //
  // Y.Doc: YDOC_KEYS.INPUT_REQUESTS = "inputRequests" - EXISTS but stored GLOBALLY
  //
  // ⚠️ DUPLICATIVE: Also exists in TaskIndexSchema.globalInputRequests
  //   - Here: requests tied to a specific task (NEW split)
  //   - TaskIndexSchema.globalInputRequests: cross-task requests not tied to any task
  //   - Y.Doc stores ALL in plan-index globally with optional planId field
  //   - Loro splits into two locations - decide which requests go where
  //   - Consider: Is this split necessary? Could simplify to just global like Y.Doc.
  //
  // ARCHITECTURE CHANGE:
  //   Current Y.Doc: ALL requests stored in plan-index doc globally with optional planId
  //   Loro spike: Split into per-task (here) and global (TaskIndexSchema.globalInputRequests)
  //   Migration impact: Browser hooks currently connect to plan-index only - will need to
  //   aggregate from multiple sources. The planId field becomes implicit (doc location).
  //
  // Feature: Agent requests user input, browser shows modal, user responds, agent continues
  // Flow: execute_code → requestUserInput() → InputRequestManager → CRDT →
  //       useInputRequests → InputRequestModal → answer → waitForResponse resolves
  //
  // UI: InputRequestModal, toast notifications, AgentRequestsBadge
  // If removed: FATAL - agents cannot request user input
  //
  // WARNING: This schema is MISSING many Y.Doc fields (see below)
  //
  inputRequests: Shape.list(
    Shape.plain.struct({
      // EXISTS: Unique identifier for CRUD operations
      // UI: Toast IDs, modal state, answer/cancel targets
      // If removed: FATAL - cannot identify or track requests
      id: Shape.plain.string(),

      // EXISTS: Input type (Y.Doc has discriminated union with 8+ types)
      // Values: "text" | "multiline" | "choice" | "confirm" | "number" | "email" | "date" | "rating" | "multi"
      // UI: InputRequestModal renders different input component per type
      // If removed: FATAL - cannot render correct input component
      // WARNING: Loro uses plain string - loses type safety vs Y.Doc discriminated union
      type: Shape.plain.string(),

      // EXISTS: The question being asked (supports markdown)
      // UI: Displayed via MarkdownContent in modal
      // If removed: User wouldn't know what agent is asking
      message: Shape.plain.string(),

      // EXISTS: Request lifecycle state
      // UI: Filters pending for display, badge counts
      // Server: waitForResponse resolves on status change
      // If removed: FATAL - can't distinguish pending from answered
      status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),

      // EXISTS: Unix timestamp when created
      // UI: Countdown timer calculation, expiration detection
      // If removed: FATAL - timeout countdown breaks
      createdAt: Shape.plain.number(),

      // EXISTS: Seconds until auto-decline (default 1800 = 30min)
      // UI: Progress bar countdown
      // If removed: MINOR - falls back to 30min default
      timeout: Shape.plain.number(),

      // EXISTS: User's answer (Y.Doc allows unknown, Loro restricts to string)
      // UI: Set by answerInputRequest()
      // Server: Returned to waiting agent
      // If removed: FATAL - agent never receives answer
      // WARNING: Y.Doc allows `unknown` (any JSON), Loro restricts to string
      response: Shape.plain.string().nullable(),

      // EXISTS: Timestamp when answered
      // UI: Cleanup age calculation
      // If removed: MINOR - lose timestamp audit
      answeredAt: Shape.plain.number().nullable(),

      // EXISTS: GitHub username who answered
      // UI: Error toast "already answered by X"
      // If removed: MODERATE - lose accountability
      answeredBy: Shape.plain.string().nullable(),

      // MISSING FIELDS from Y.Doc InputRequestSchema:
      // - defaultValue: Pre-population of inputs
      // - isBlocker: Urgent red styling, BLOCKER badge (HIGH impact)
      // - options: Choice input options array (FATAL for choice type)
      // - multiSelect: Multi-select checkboxes
      // - displayAs: "radio" | "checkbox" | "dropdown"
      // - placeholder: Dropdown placeholder
      // - min/max: Number/date/rating validation
      // - format: Number format hints
      // - domain: Email domain restriction
      // - style/labels: Rating style options
      // - questions/responses: Multi-question forms (HIGH impact)
    })
  ),

  //
  // PR_REVIEW_COMMENTS - GitHub PR review comments
  //
  // Y.Doc: YDOC_KEYS.PR_REVIEW_COMMENTS = "prReviewComments" - EXISTS and MATCHES
  // Helpers: getPRReviewComments(), addPRReviewComment(), resolvePRReviewComment(),
  //          removePRReviewComment(), replyToPRReviewComment()
  //
  // Feature: Code review on GitHub PR diffs within Shipyard UI
  // Workflow: User views linked PR → clicks line → adds comment → synced via CRDT
  //           Agent reads via read_diff_comments, replies via reply_to_diff_comment
  //
  // UI: Changes tab → PR diff view → inline comment widgets (FileDiffView, DiffCommentThread)
  // If removed: FATAL - entire PR code review feature disappears
  //
  // Difference from localDiffComments:
  //   - PR comments are PERMANENT (linked to immutable GitHub PR diff)
  //   - No staleness tracking needed (PR diffs don't change)
  //   - Has prNumber field instead of baseRef/lineContentHash/machineId
  //
  prReviewComments: Shape.list(
    Shape.plain.struct({
      // EXISTS: Unique identifier for CRUD operations
      // UI: React keys, resolve/delete targets, reply linking
      // If removed: FATAL - cannot identify comments for any operation
      id: Shape.plain.string(),

      // EXISTS: Which PR this comment belongs to
      // UI: usePRReviewComments(ydoc, prNumber) filters by this
      // If removed: FATAL - cannot associate comments with PRs, multi-PR tasks break
      prNumber: Shape.plain.number(),

      // EXISTS: File path within the repo
      // UI: Comments filtered by path === filename in FileDiffView
      // If removed: FATAL - cannot show which file comment belongs to
      path: Shape.plain.string(),

      // EXISTS: Line number in the diff
      // UI: Positions comment widget inline with diff line
      // If removed: FATAL - comments become unanchored, no inline display
      line: Shape.plain.number(),

      // EXISTS: Comment text content
      // UI: Displayed in DiffCommentCard, read by agents
      // If removed: FATAL - no content to display
      body: Shape.plain.string(),

      // EXISTS: GitHub username who wrote the comment
      // UI: Avatar (github.com/${author}.png), name display, delete permission check
      // If removed: HIGH - no attribution, delete permission breaks
      author: Shape.plain.string(),

      // EXISTS: Unix timestamp ms when created
      // UI: "2h ago" relative time display, chronological sorting
      // If removed: MEDIUM - no timestamp, ordering inconsistent
      createdAt: Shape.plain.number(),

      // EXISTS: Whether comment has been addressed
      // UI: Green styling, "Resolved" badge, checkbox toggle, LLM filter option
      // If removed: HIGH - cannot track addressed feedback, workflow breaks
      resolved: Shape.plain.boolean().nullable(),

      // EXISTS: Parent comment ID for threading
      // UI: "↳ Reply" indicator in LLM output, sorting replies after parents
      // If removed: MEDIUM - lose thread structure, all comments become top-level
      inReplyTo: Shape.plain.string().nullable(),
    })
  ),

  //
  // LOCAL_DIFF_COMMENTS - Uncommitted changes review
  //
  // Y.Doc: YDOC_KEYS.LOCAL_DIFF_COMMENTS = "localDiffComments" - EXISTS and MATCHES
  // Helpers: getLocalDiffComments(), addLocalDiffComment(), resolveLocalDiffComment(),
  //          removeLocalDiffComment(), replyToLocalDiffComment()
  //
  // Feature: Code review on UNCOMMITTED local changes (git working directory)
  // Workflow: Agent makes changes → user views Changes tab → comments on diff lines
  //           Comments have STALENESS TRACKING to detect when code changes
  //
  // UI: Changes tab → Local changes view → inline comment widgets (LocalChangesViewer)
  // If removed: FATAL - cannot review uncommitted work, only PR review remains
  //
  // Difference from prReviewComments:
  //   - Local comments are EPHEMERAL (uncommitted code changes constantly)
  //   - Has staleness tracking: baseRef (HEAD SHA) + lineContentHash
  //   - Has machineId to track which machine's snapshot was commented on
  //   - No prNumber (not associated with any PR)
  //
  // Staleness Detection (staleness-detection.ts):
  //   1. HEAD changed: baseRef !== currentHeadSha → shows "HEAD changed" warning
  //   2. Line changed: lineContentHash differs → shows "Line content changed" warning
  //
  localDiffComments: Shape.list(
    Shape.plain.struct({
      // EXISTS: Unique identifier for CRUD operations
      // UI: React keys, resolve/delete targets, reply linking
      // If removed: FATAL - cannot identify comments for any operation
      id: Shape.plain.string(),

      // EXISTS: Discriminator field, always "local"
      // UI: Used in DiffCommentCard to determine if staleness UI should show
      // If removed: Cannot distinguish local from PR comments, staleness breaks
      type: Shape.plain.string('local'),

      // EXISTS: File path within the repo
      // UI: Comments filtered by path in LocalChangesViewer
      // If removed: FATAL - cannot show which file comment belongs to
      path: Shape.plain.string(),

      // EXISTS: Line number in the diff
      // UI: Positions comment widget inline with diff line
      // If removed: FATAL - comments become unanchored
      line: Shape.plain.number(),

      // EXISTS: Comment text content
      // UI: Displayed in DiffCommentCard, read by agents
      // If removed: FATAL - no content to display
      body: Shape.plain.string(),

      // EXISTS: GitHub username who wrote the comment
      // UI: Avatar, name display, delete permission check
      // If removed: HIGH - no attribution, delete permission breaks
      author: Shape.plain.string(),

      // EXISTS: Unix timestamp ms when created
      // UI: "2h ago" relative time display, chronological sorting
      // If removed: MEDIUM - no timestamp, ordering inconsistent
      createdAt: Shape.plain.number(),

      // EXISTS: Git HEAD SHA when comment was created
      // UI: Compared to current HEAD - shows "HEAD changed" warning chip if different
      // If removed: HIGH - lose commit-level staleness detection
      baseRef: Shape.plain.string(),

      // EXISTS: Hash of the line content when comment was created
      // UI: Compared to current line - shows "Line content changed" warning if different
      // If removed: HIGH - lose fine-grained staleness, only commit-level remains
      // Note: Y.Doc schema has this as optional, Loro has non-nullable - reconcile during migration
      lineContentHash: Shape.plain.string(),

      // EXISTS: Whether comment has been addressed
      // UI: Green styling, "Resolved" badge, checkbox toggle
      // If removed: HIGH - cannot track addressed feedback
      resolved: Shape.plain.boolean().nullable(),

      // EXISTS: Parent comment ID for threading
      // UI: "↳ Reply" indicator, sorting replies after parents
      // If removed: MEDIUM - lose thread structure
      inReplyTo: Shape.plain.string().nullable(),

      // EXISTS: Which machine's changeSnapshot this comment was created on
      // UI: Set when viewing remote machine's snapshot, stored for provenance
      // Relationship: changeSnapshots[machineId] contains the diff this comment references
      // If removed: MEDIUM - lose provenance of which machine's changes were reviewed
      machineId: Shape.plain.string().nullable(),
    })
  ),

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
  //
  // TASKS - Registry of all tasks
  //
  // Y.Doc: YDOC_KEYS.PLANS = "plans" - EXISTS and used extensively
  // Helpers: packages/schema/src/plan-index-helpers.ts (CRUD operations)
  //
  // UI: Powers ALL task list views - Inbox, Kanban, Search, Archive pages
  // If removed: App is unusable - no task discovery or navigation
  //
  // ⚠️ DUPLICATIVE: Many fields here duplicate TaskDocumentSchema.meta
  //   - id, title, status, createdAt, updatedAt, ownerId, archivedAt, tags
  //   - Purpose: List tasks without loading full task docs (performance optimization)
  //   - Must keep in sync: when meta changes, index entry must also update
  //   - Y.Doc has same pattern (PlanIndexEntry duplicates PlanMetadata fields)
  //   - Consider: Can Loro provide better cross-doc queries to avoid duplication?
  //
  // taskId → task index entry (lightweight metadata for listing/filtering)
  tasks: Shape.record(
    Shape.struct({
      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.id
      // EXISTS: Core identifier used everywhere
      // UI: URL routing, panel selection, IndexedDB keys
      // If removed: FATAL - cannot identify or navigate to tasks
      id: Shape.plain.string(),

      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.title
      // EXISTS: Primary display text for tasks
      // UI: InboxPage, KanbanCard, SearchPage, ArchivePage - all show title
      // If removed: Tasks would be empty unnamed cards
      title: Shape.plain.string(),

      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.status
      // EXISTS: Workflow state determining UI treatment
      // UI: StatusBadge colors, Kanban column placement, Inbox filtering
      // If removed: FATAL - kanban board breaks, no workflow tracking
      status: Shape.plain.string('draft', 'pending_review', 'changes_requested', 'in_progress', 'completed'),

      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.createdAt
      // EXISTS: When task was created
      // UI: Only used as fallback timestamp (rarely displayed)
      // If removed: LOW impact - just lose fallback value
      createdAt: Shape.plain.number(),

      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.updatedAt
      // EXISTS: Last modification timestamp
      // UI: "Updated 5 min ago" display, sorting, unread detection (compared to viewedBy)
      // If removed: HIGH - sorting breaks, unread indicators break, no freshness info
      updatedAt: Shape.plain.number(),

      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.ownerId
      // EXISTS: GitHub username who owns this task
      // UI: Owner avatar on KanbanCard, "My Tasks" vs "Shared" filtering
      // If removed: HIGH - ownership filtering breaks, can't distinguish my tasks
      ownerId: Shape.plain.string().nullable(),

      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.repo (NEW to index)
      // NEW: GitHub repo (e.g., "owner/repo")
      // Currently only in full PlanMetadata, not in Y.Doc PlanIndexEntry
      // Gain: Display repo name in task lists without loading full doc
      repo: Shape.plain.string().nullable(),

      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.pr (NEW to index)
      // NEW: PR number linked to this task
      // Currently only in full PlanMetadata, not in Y.Doc PlanIndexEntry
      // Gain: Display PR #123 badge in task lists without loading full doc
      pr: Shape.plain.number().nullable(),

      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.archivedAt
      // EXISTS (different): Y.Doc uses deleted/deletedAt discriminated union
      // UI: Filters archived from active lists, ArchivePage display
      // If removed: HIGH - cannot identify archived tasks, archive page breaks
      // Note: Loro consolidates to simple nullable timestamp
      archivedAt: Shape.plain.number().nullable(),

      // ⚠️ DUPLICATIVE with TaskDocumentSchema.meta.tags
      // EXISTS: Flexible categorization (e.g., ["ui", "bug", "project:mobile-app"])
      // UI: TagChips on InboxPage (first 3), KanbanCard (first 2), SearchPage filtering
      // If removed: MEDIUM - lose tagging/categorization feature
      tags: Shape.list(Shape.plain.string()),

      // NEW: Pre-computed flag for unread events
      // UI: None currently - events require loading full doc
      // Gain: Fast unread badge on task cards without loading events array
      hasUnreadEvents: Shape.plain.boolean(),

      // NEW: Pre-computed flag for pending input requests
      // UI: None currently - uses AgentRequestsBadge which loads requests
      // Gain: Fast "needs input" badge without loading full task doc
      hasUnreadInputRequests: Shape.plain.boolean(),

      // NEW: Pre-computed flag for unread comments
      // UI: None currently - no comment notification system exists
      // Gain: Comment notification badges, "new comments since last view" feature
      hasUnreadComments: Shape.plain.boolean(),
    })
  ),

  //
  // GLOBAL INPUT REQUESTS - Cross-task user input queue
  //
  // Y.Doc: Currently ALL input requests go to plan-index doc under YDOC_KEYS.INPUT_REQUESTS
  //   The Loro spike splits this into per-task (TaskDocumentSchema.inputRequests) and
  //   global (here) - requests not tied to any specific task.
  //
  // ⚠️ DUPLICATIVE: Also exists in TaskDocumentSchema.inputRequests
  //   - Here: cross-task requests not tied to any specific task
  //   - TaskDocumentSchema.inputRequests: requests for a specific task
  //   - Y.Doc stores ALL in one place with optional planId
  //   - Consider: Is this split necessary? Current Y.Doc works with single global store.
  //
  // Current Architecture Note:
  //   Y.Doc stores ALL requests globally with optional planId field for association.
  //   Loro changes this to: per-task requests in TaskDoc, truly global here.
  //
  // UI: InputRequestModal, toast notifications, AgentRequestsBadge, Inbox pending count
  // If removed: FATAL - agents cannot request user input
  //
  // WARNING: This schema is MISSING fields from Y.Doc InputRequestSchema:
  //   - planId (handled by doc location now)
  //   - defaultValue (pre-population)
  //   - isBlocker (urgent red styling, BLOCKER badge)
  //   - options/multiSelect/displayAs (choice input type)
  //   - questions/responses (multi-question forms)
  //   - Type-specific validation fields (min/max/format for number/date/rating)
  //
  globalInputRequests: Shape.list(
    Shape.plain.struct({
      // EXISTS: Unique identifier for this request
      // UI: Toast IDs, tracking seen requests, answer/cancel/decline operations
      // If removed: FATAL - cannot answer or track requests
      id: Shape.plain.string(),

      // EXISTS: Input type determining UI component
      // Y.Doc has: "text" | "multiline" | "choice" | "confirm" | "number" | "email" | "date" | "rating" | "multi"
      // UI: Renders TextInput, ChoiceInput, ConfirmInput, etc. based on type
      // If removed: FATAL - cannot render correct input component
      // WARNING: Loro loses discriminated union type safety (plain string vs literal union)
      type: Shape.plain.string(),

      // EXISTS: The question being asked (supports markdown)
      // UI: Displayed via MarkdownContent in InputRequestModal
      // If removed: User wouldn't know what agent is asking
      message: Shape.plain.string(),

      // EXISTS: Request lifecycle state
      // UI: Filters pending for display, server resolves promise on status change
      // If removed: FATAL - can't distinguish pending from answered, server hangs forever
      status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),

      // EXISTS: When request was created (Unix ms)
      // UI: Countdown timer calculation, expiration detection
      // If removed: FATAL - timeout countdown shows "--:--", expiration detection breaks
      createdAt: Shape.plain.number(),

      // EXISTS: Seconds until auto-decline (default 1800 = 30min)
      // UI: Progress bar and countdown in modal
      // If removed: MINOR - falls back to 30-minute default everywhere
      timeout: Shape.plain.number(),

      // EXISTS: User's answer (Y.Doc allows unknown, Loro restricts to string)
      // UI: Set by answerInputRequest(), returned to waiting agent
      // If removed: FATAL - agent never receives user's answer
      response: Shape.plain.string().nullable(),

      // EXISTS: When user answered (Unix ms)
      // UI: Audit trail, cleanup age calculation
      // If removed: MINOR - lose timestamp of when answered
      answeredAt: Shape.plain.number().nullable(),

      // EXISTS: GitHub username who answered
      // UI: Error toast "already answered by X", audit trail, returned to agent
      // If removed: MODERATE - lose accountability, less helpful error messages
      answeredBy: Shape.plain.string().nullable(),
    })
  ),

  //
  // AGENTS - Global agent registry
  //
  // Y.Doc: YDOC_KEYS.PRESENCE (per-plan only, not global). Current schema has only:
  //   { agentType, sessionId, connectedAt, lastSeenAt }
  //
  // UI: Currently NONE - presence is written but never displayed anywhere.
  //   Real-time "who's online" uses WebRTC awareness (useP2PPeers.ts), not this CRDT data.
  //
  // If removed: Nothing breaks today (write-only audit trail).
  // If kept: Could power future "all connected agents" dashboard, historical audit logs.
  //
  // machineId → agent info
  agents: Shape.record(
    Shape.struct({
      // NEW: Unique identifier for this machine (e.g., hostname hash)
      // Gain: Multi-machine support - know which physical machine an agent runs on
      machineId: Shape.plain.string(),

      // NEW: Human-readable name (e.g., "Jacob's MacBook Pro")
      // Gain: UI can show friendly names instead of opaque IDs in agent lists
      machineName: Shape.plain.string(),

      // NEW: GitHub username who owns this machine
      // Gain: Multi-user support - filter agents by owner, permission checks
      ownerId: Shape.plain.string(),

      // EXISTS: Unique session identifier for this agent run
      // UI: None currently. Could be used for "agent session history" feature.
      // If removed: Lose ability to distinguish multiple runs on same machine.
      sessionId: Shape.plain.string(),

      // EXISTS: When this agent session started (Unix ms)
      // UI: None currently. Could show "connected 5 min ago" in agent list.
      // If removed: Lose session duration tracking.
      connectedAt: Shape.plain.number(),

      // EXISTS: Last heartbeat timestamp (Unix ms)
      // UI: None currently. Could detect stale/dead agents.
      // If removed: Can't distinguish active vs crashed agents.
      lastSeenAt: Shape.plain.number(),

      // NEW: Task IDs this agent is currently working on
      // Gain: "Agent X is working on tasks A, B, C" - cross-task agent visibility
      activeTasks: Shape.list(Shape.plain.string()),
    })
  ),

  //
  // VIEWED_BY - Per-task view tracking for inbox unread status
  //
  // Y.Doc: PLAN_INDEX_VIEWED_BY_KEY = "viewedBy" (nested Y.Map<Y.Map<number>>)
  //
  // ⚠️ DUPLICATIVE: Also exists in TaskDocumentSchema.meta.viewedBy
  //   - Here: global nested taskId → (username → timestamp) for inbox listing
  //   - TaskDocumentSchema.meta.viewedBy: per-task username → timestamp when doc loaded
  //   - Y.Doc has BOTH for different access patterns
  //   - Consider: Is per-task viewedBy necessary if global index has the same data?
  //
  // UI: Inbox page (/) - blue unread dot on tasks you haven't viewed since last update
  //   - usePlanIndex.ts compares viewedBy[username] vs task.updatedAt
  //   - Clicking a task calls markPlanAsRead() which updates this timestamp
  //
  // If removed: Inbox loses unread indicators. All tasks appear "read" always.
  //
  // Nested: taskId → (username → timestamp)
  viewedBy: Shape.record(
    Shape.record(Shape.plain.number())  // username → last viewed timestamp
  ),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Task Document Types
export type TaskDocumentShape = typeof TaskDocumentSchema;
export type TaskDocument = Infer<typeof TaskDocumentSchema>;
export type MutableTaskDocument = InferMutableType<typeof TaskDocumentSchema>;
export type TaskMeta = Infer<typeof TaskDocumentSchema.shapes.meta>;
export type TaskComment = Infer<typeof TaskDocumentSchema.shapes.comments>;
export type TaskEvent = Infer<typeof TaskDocumentSchema.shapes.events>;
export type TaskArtifact = Infer<typeof TaskDocumentSchema.shapes.artifacts>;
export type TaskDeliverable = Infer<typeof TaskDocumentSchema.shapes.deliverables>;
export type TaskLinkedPR = Infer<typeof TaskDocumentSchema.shapes.linkedPRs>;
export type TaskInputRequest = Infer<typeof TaskDocumentSchema.shapes.inputRequests>;
export type TaskPRReviewComment = Infer<typeof TaskDocumentSchema.shapes.prReviewComments>;
export type TaskLocalDiffComment = Infer<typeof TaskDocumentSchema.shapes.localDiffComments>;

// Task Index Types
export type TaskIndexShape = typeof TaskIndexSchema;
export type TaskIndex = Infer<typeof TaskIndexSchema>;
export type MutableTaskIndex = InferMutableType<typeof TaskIndexSchema>;
export type TaskIndexEntry = Infer<typeof TaskIndexSchema.shapes.tasks>;
export type GlobalInputRequest = Infer<typeof TaskIndexSchema.shapes.globalInputRequests>;
export type AgentInfo = Infer<typeof TaskIndexSchema.shapes.agents>;
