# Adversarial Reviewer Memory

## Project Patterns
- `loro()` on a `TypedDoc` returns `LoroDoc` (via LORO_SYMBOL proxy). It does NOT have a `.container` property.
- `taskHandle.loroDoc` is the correct way to access the underlying `LoroDoc` from a Handle.
- `loro-extended` uses Proxy-based TypedDoc/DocRef. Be wary of property access on proxied objects -- TypeScript may not catch invalid accesses due to `unknown` overloads.
- `Shape.record(Shape.any())` fields (like `planEditorDocs`) are escape hatches -- raw LoroDoc access is needed.
- `change()` from `@loro-extended/change` auto-commits. Manual `loroDoc.commit()` is for raw LoroDoc operations.

## Review Checklist (Shipyard-specific)
- Check `loro()` usage: returns LoroDoc for TypedDoc, LoroMap/List/Text for refs
- Check CRDT container access patterns: `insertContainer` returns detached, must call `getAttached()`
- Check ProseMirror position tracking in collaborative mode (positions shift with remote edits)
- Check for orphaned CRDT containers from double-write patterns (e.g., insertNodeMap + writeHeading both setting attributes)

## Daemon Architecture (session lifecycle)
- `onTaskDocChanged` is the main event loop: fires on CRDT subscription events AND directly after cleanup
- `cleanupTaskRun` calls `closeSession()` BEFORE `activeTasks.delete()` -- creates async gap where isStreaming is false but task is still "active"
- `promotePendingFollowUps` has TWO code paths: one inside active-task block, one in orphan block. Orphan path does NOT dispatch to session.
- `#processMessages` has TWO `#markFailed` paths: catch block (line 657) AND post-loop (line 653-663). Both trigger on idle timeout.
- `shouldResume` skips 'failed' sessions but allows 'interrupted' -- this is the key mechanism for the idle timeout fix
- `recoverOrphanedTask` sets session.status='interrupted' but meta.status='failed' -- so shouldResume works on next user message
- `change()` fires subscription callbacks asynchronously (microtask), NOT synchronously during the change -- no infinite loop risk
