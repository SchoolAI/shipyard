# Comment Reply API Testing

This document describes manual testing procedures for the comment reply functionality.

## Setup

1. Start the MCP server:
```bash
cd /Users/jacobpetterle/Working\ Directory/shipyard-wt/132-comment-reply-api
pnpm --filter @shipyard/server dev
```

2. Open a new terminal and start the web server:
```bash
pnpm --filter @shipyard/web dev
```

## Test 1: Reply to BlockNote Thread Comment

### Step 1: Create a test plan with BlockNote content

Use MCP execute_code:
```typescript
const result = await createPlan({
  title: "Test Comment Reply - BlockNote",
  content: "# Test Plan\n\nThis is a test plan for comment replies.\n\n- [ ] Task 1 {#deliverable}\n- [ ] Task 2"
});

console.log("Plan created:", result.planId);
console.log("URL:", result.url);
return { planId: result.planId, sessionToken: result.sessionToken, url: result.url };
```

### Step 2: Manually add a comment in the browser

1. Open the plan URL from Step 1
2. Select some text (e.g., "Task 1")
3. Click to add a comment
4. Type: "This task needs more detail"
5. Submit the comment

### Step 3: Read the plan to get the thread ID

```typescript
const { planId, sessionToken } = // from Step 1
const result = await readPlan({
  planId,
  sessionToken,
  includeAnnotations: true
});

// Look for [thread:...] in the output
console.log(result);
return result;
```

### Step 4: Reply to the thread

Extract the thread ID from Step 3 output (format: `[thread:abc123]`), then:

```typescript
const { planId, sessionToken } = // from Step 1
const threadId = "thread-abc123"; // from Step 3

const reply = await replyToThreadComment({
  planId,
  sessionToken,
  threadId,
  body: "Good point! I'll add more details about the acceptance criteria."
});

console.log(reply);
return reply;
```

### Step 5: Verify the reply appears

Refresh the browser and check that:
- The reply appears in the comment thread
- Author is shown as "AI"
- Reply is properly threaded under the original comment

## Test 2: Reply to PR Diff Comment

### Step 1: Create a test plan

```typescript
const result = await createPlan({
  title: "Test Comment Reply - PR Diff",
  content: "# Test Plan\n\nThis is a test plan for diff comment replies."
});

return { planId: result.planId, sessionToken: result.sessionToken };
```

### Step 2: Link a PR (optional, or use mock PR number)

```typescript
const { planId, sessionToken } = // from Step 1

const pr = await linkPR({
  planId,
  sessionToken,
  prNumber: 123 // Use a real PR number or just use 999 for testing
});

return pr;
```

### Step 3: Add a PR review comment

```typescript
const { planId, sessionToken } = // from Step 1

const comment = await addPRReviewComment({
  planId,
  sessionToken,
  prNumber: 123, // or 999
  path: "src/test.ts",
  line: 42,
  body: "Consider adding input validation here"
});

console.log("Comment added:", comment);
return comment;
```

### Step 4: Read diff comments to get the comment ID

```typescript
const { planId, sessionToken } = // from Step 1

const result = await readDiffComments({
  planId,
  sessionToken,
  includePR: true
});

// Look for [pr:...] in the output
console.log(result);
return result;
```

### Step 5: Reply to the diff comment

Extract the comment ID from Step 4 (format: `[pr:abc123]`), then:

```typescript
const { planId, sessionToken } = // from Step 1
const commentId = "pr-abc123"; // from Step 4 (remove [pr: prefix)

const reply = await replyToDiffComment({
  planId,
  sessionToken,
  commentId,
  body: "Good catch! I'll add Zod validation in the next commit."
});

console.log(reply);
return reply;
```

### Step 6: Verify the reply appears

Re-read the diff comments:

```typescript
const { planId, sessionToken } = // from Step 1

const result = await readDiffComments({
  planId,
  sessionToken,
  includePR: true
});

// Should see:
// - [pr:abc123] Line 42 (AI): Consider adding input validation here
// - [pr:def456] Line 42 (AI) ↳ Reply: Good catch! I'll add Zod validation...

console.log(result);
return result;
```

## Expected Outputs

### BlockNote Thread Reply Format

```markdown
### 1. On: "Task 1"
[thread:abc123] jacob: This task needs more detail
[comment:xyz789] AI (reply): Good point! I'll add more details about the acceptance criteria.
```

### PR Diff Comment Reply Format

```markdown
## PR Review Comments (PR #123)

### src/test.ts
- [pr:abc123] Line 42 (jacob): Consider adding input validation here
- [pr:def456] Line 42 (AI) ↳ Reply: Good catch! I'll add Zod validation in the next commit.
```

## Success Criteria

- ✅ Thread replies appear in read_plan output with [comment:ID] format
- ✅ Diff comment replies appear in readDiffComments output with ↳ Reply indicator
- ✅ Reply author is shown as "AI"
- ✅ Replies are properly nested/threaded with parent comments
- ✅ inReplyTo field is set correctly in CRDT data
