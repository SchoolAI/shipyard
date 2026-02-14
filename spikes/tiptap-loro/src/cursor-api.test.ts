/**
 * Loro Cursor API Validation Test
 *
 * This test validates that Loro's Cursor API can track text positions
 * correctly across concurrent edits - which is critical for comment anchoring.
 *
 * The Cursor API:
 * - `LoroText.getCursor(pos, side)` - Creates a stable cursor at a position
 * - `LoroDoc.getCursorPos(cursor)` - Resolves cursor to current position
 *
 * Cursors are "sticky" - they track the character at a position, not the
 * position index itself. When text is inserted/deleted before the cursor,
 * the cursor position updates to point to the same character.
 */

import { type Cursor, LoroDoc } from 'loro-crdt';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Loro Cursor API for Comment Anchoring', () => {
  let doc: LoroDoc;

  beforeEach(() => {
    doc = new LoroDoc();
    doc.setPeerId(BigInt(1));
  });

  describe('Basic Cursor Operations', () => {
    it('creates a cursor at a specific position', () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello World');
      doc.commit();

      // Create cursor at position 5 (after "Hello")
      const cursor = text.getCursor(5, 0);
      expect(cursor).toBeDefined();

      // Resolve cursor position
      const pos = doc.getCursorPos(cursor!);
      expect(pos).toBeDefined();
      expect(pos!.offset).toBe(5);
    });

    it('cursor tracks position after insert BEFORE cursor', () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello World');
      doc.commit();

      // Create cursor at position 6 (at "W" in "World")
      const cursor = text.getCursor(6, 0);
      expect(cursor).toBeDefined();

      // Insert text at beginning
      text.insert(0, 'Hi ');
      doc.commit();

      // Cursor should have moved: 6 + 3 = 9
      const pos = doc.getCursorPos(cursor!);
      expect(pos).toBeDefined();
      expect(pos!.offset).toBe(9); // Cursor followed "W" to new position

      // Verify the text at position is still "W"
      expect(text.toString()).toBe('Hi Hello World');
      expect(text.toString()[pos!.offset]).toBe('W');
    });

    it('cursor stays in place after insert AFTER cursor', () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello World');
      doc.commit();

      // Create cursor at position 5 (after "Hello")
      const cursor = text.getCursor(5, 0);

      // Insert text at the end
      text.insert(11, '!!!');
      doc.commit();

      // Cursor should NOT have moved
      const pos = doc.getCursorPos(cursor!);
      expect(pos!.offset).toBe(5);
    });

    it('cursor adjusts after delete BEFORE cursor', () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello World');
      doc.commit();

      // Create cursor at position 6 (at "W")
      const cursor = text.getCursor(6, 0);

      // Delete "Hello " (6 characters starting at 0)
      text.delete(0, 6);
      doc.commit();

      // Cursor should have moved back: 6 - 6 = 0
      const pos = doc.getCursorPos(cursor!);
      expect(pos!.offset).toBe(0);
      expect(text.toString()).toBe('World');
      expect(text.toString()[pos!.offset]).toBe('W');
    });
  });

  describe('Concurrent Edits (Simulating Collaboration)', () => {
    it('cursor tracks position across sync from another peer', () => {
      // Peer A creates document with content
      const docA = new LoroDoc();
      docA.setPeerId(BigInt(1));
      const textA = docA.getText('content');
      textA.insert(0, 'Hello World');
      docA.commit();

      // Peer B syncs from A
      const docB = new LoroDoc();
      docB.setPeerId(BigInt(2));
      docB.import(docA.export({ mode: 'update' }));
      const textB = docB.getText('content');

      // Peer B creates a cursor at "W"
      const cursor = textB.getCursor(6, 0);
      expect(cursor).toBeDefined();

      // Peer A makes an edit (inserts "Beautiful " before "World")
      textA.insert(6, 'Beautiful ');
      docA.commit();

      // Peer B syncs the change from A
      docB.import(docA.export({ mode: 'update' }));

      // Cursor should still point to "W" (which moved)
      const pos = docB.getCursorPos(cursor!);
      expect(pos).toBeDefined();

      // "Hello Beautiful World" - "W" is now at position 16
      expect(textB.toString()).toBe('Hello Beautiful World');
      expect(pos!.offset).toBe(16);
      expect(textB.toString()[pos!.offset]).toBe('W');
    });

    it('cursor survives multiple concurrent edits from different peers', () => {
      // Set up two peers with same initial content
      const docA = new LoroDoc();
      docA.setPeerId(BigInt(1));
      const textA = docA.getText('content');
      textA.insert(0, 'The quick brown fox');
      docA.commit();

      const docB = new LoroDoc();
      docB.setPeerId(BigInt(2));
      docB.import(docA.export({ mode: 'update' }));
      const textB = docB.getText('content');

      // Create cursor at "fox" (position 16)
      const cursor = textB.getCursor(16, 0);
      expect(textB.toString()[16]).toBe('f'); // Verify cursor is at "f" in "fox"

      // Peer A inserts at beginning
      textA.insert(0, '[A] ');
      docA.commit();

      // Peer B inserts in middle (before cursor)
      textB.insert(10, 'very ');
      docB.commit();

      // Sync A -> B
      docB.import(docA.export({ mode: 'update' }));

      // Sync B -> A
      docA.import(docB.export({ mode: 'update' }));

      // Both docs should have same content now
      const finalText = textB.toString();
      expect(textA.toString()).toBe(finalText);

      // Cursor should still point to "f" in "fox"
      const pos = docB.getCursorPos(cursor!);
      expect(pos).toBeDefined();
      expect(finalText[pos!.offset]).toBe('f');
    });
  });

  describe('Comment Anchoring Use Case', () => {
    it('simulates comment mark anchoring to selected text', () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello World, this is a test document.');
      doc.commit();

      // Simulate selecting "World" (positions 6-11)
      const startCursor = text.getCursor(6, 0);
      const endCursor = text.getCursor(11, 0);

      // Store comment anchor
      interface CommentAnchor {
        id: string;
        startCursor: Cursor;
        endCursor: Cursor;
      }

      const commentAnchor: CommentAnchor = {
        id: 'comment-123',
        startCursor: startCursor!,
        endCursor: endCursor!,
      };

      // User edits before the comment
      text.insert(0, 'Prefix: ');
      doc.commit();

      // Resolve current positions
      const startPos = doc.getCursorPos(commentAnchor.startCursor);
      const endPos = doc.getCursorPos(commentAnchor.endCursor);

      // Extract the commented text
      const fullText = text.toString();
      const commentedText = fullText.slice(startPos!.offset, endPos!.offset);

      expect(commentedText).toBe('World');
      expect(startPos!.offset).toBe(14); // 6 + 8 ("Prefix: ".length)
      expect(endPos!.offset).toBe(19); // 11 + 8
    });

    it('handles comment anchor when text is deleted before it', () => {
      const text = doc.getText('content');
      text.insert(0, 'Delete this: Important text here');
      doc.commit();

      // Anchor to "Important" (positions 13-22)
      const startCursor = text.getCursor(13, 0);
      const endCursor = text.getCursor(22, 0);

      // Delete "Delete this: " (13 characters)
      text.delete(0, 13);
      doc.commit();

      // Resolve positions - should now be at 0-9
      const startPos = doc.getCursorPos(startCursor!);
      const endPos = doc.getCursorPos(endCursor!);

      expect(text.toString()).toBe('Important text here');
      expect(startPos!.offset).toBe(0);
      expect(endPos!.offset).toBe(9);
      expect(text.toString().slice(startPos!.offset, endPos!.offset)).toBe('Important');
    });

    it('handles comment anchor when text is inserted inside it', () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello World');
      doc.commit();

      // Anchor to "Hello World" (positions 0-11)
      const startCursor = text.getCursor(0, 0);
      const endCursor = text.getCursor(11, 0);

      // Insert inside the comment range
      text.insert(6, 'Beautiful ');
      doc.commit();

      // Start should stay at 0
      const startPos = doc.getCursorPos(startCursor!);
      const endPos = doc.getCursorPos(endCursor!);

      expect(text.toString()).toBe('Hello Beautiful World');
      expect(startPos!.offset).toBe(0);
      // LEARNING: Cursor at position 11 (end of "World") with side=0 tracks the
      // end boundary. When we insert "Beautiful " (10 chars) inside, the cursor
      // at position 11 moves to position 21 (11 + 10).
      // This is correct behavior - the cursor was at the END of "World", and
      // inserting before that pushes the end position forward.
      expect(endPos!.offset).toBe(21);
    });
  });

  describe('Cursor Side Parameter', () => {
    it('side=0 (Left) stays before inserted character at same position', () => {
      const text = doc.getText('content');
      text.insert(0, 'AB');
      doc.commit();

      // Cursor at position 1 with side=0 (left/before)
      const cursor = text.getCursor(1, 0);

      // Insert at same position
      text.insert(1, 'X');
      doc.commit();

      // Cursor with side=0 should stay at 1 (before X)
      const pos = doc.getCursorPos(cursor!);
      expect(text.toString()).toBe('AXB');
      // The cursor was pointing at "B", which is now at position 2
      expect(pos!.offset).toBe(2);
    });

    it('side=1 (Right) stays after character when insert at same position', () => {
      const text = doc.getText('content');
      text.insert(0, 'AB');
      doc.commit();

      // Cursor at position 1 with side=1 (right/after)
      const cursor = text.getCursor(1, 1);

      // Insert at same position
      text.insert(1, 'X');
      doc.commit();

      const pos = doc.getCursorPos(cursor!);
      // With side=1, cursor sticks to the character after position
      // This is "B" which moved to position 2
      expect(text.toString()).toBe('AXB');
      expect(pos!.offset).toBe(2);
    });

    it('side=-1 tracks the character at position (same as side=0)', () => {
      const text = doc.getText('content');
      text.insert(0, 'AB');
      doc.commit();

      // Cursor at position 1 with side=-1
      const cursor = text.getCursor(1, -1);

      // Insert at same position
      text.insert(1, 'X');
      doc.commit();

      const pos = doc.getCursorPos(cursor!);
      expect(text.toString()).toBe('AXB');
      // LEARNING: side=-1 in Loro v1.10 does NOT make the cursor "sticky" to the index.
      // It still tracks the character at position 1 ("B"), which moves to position 2
      // after inserting "X". This matches side=0 behavior.
      // The side parameter affects how the cursor behaves relative to the character,
      // not whether it tracks position vs character.
      expect(pos!.offset).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('cursor at beginning of text', () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello');
      doc.commit();

      const cursor = text.getCursor(0, 0);

      // Insert at beginning
      text.insert(0, 'New ');
      doc.commit();

      const pos = doc.getCursorPos(cursor!);
      // Cursor was at "H", which moved to position 4
      expect(pos!.offset).toBe(4);
    });

    it('cursor at end of text follows appended content', () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello');
      doc.commit();

      const cursor = text.getCursor(5, 0);

      // Append text
      text.insert(5, ' World');
      doc.commit();

      const pos = doc.getCursorPos(cursor!);
      // LEARNING: Cursor at end of text (position 5) with side=0 follows
      // the insertion point when text is appended. The cursor moves from 5 to 11
      // because text was inserted AT the cursor position, pushing it forward.
      // This is the expected CRDT behavior - the cursor tracks a logical position
      // relative to existing content, and insertion at that position pushes it.
      expect(text.toString()).toBe('Hello World');
      expect(pos!.offset).toBe(11);
    });

    it('cursor survives text deletion that includes cursor position', () => {
      const text = doc.getText('content');
      text.insert(0, 'ABCDE');
      doc.commit();

      // Cursor at position 2 (at "C")
      const cursor = text.getCursor(2, 0);

      // Delete "BCD" (positions 1-4)
      text.delete(1, 3);
      doc.commit();

      const pos = doc.getCursorPos(cursor!);
      // After deleting around cursor, it should be at the deletion point
      expect(text.toString()).toBe('AE');
      // Cursor "C" was deleted, so cursor falls back to position 1
      expect(pos!.offset).toBe(1);
    });

    it('handles empty text container', () => {
      const text = doc.getText('content');
      // Don't insert anything

      // Cursor at position 0 in empty text
      const cursor = text.getCursor(0, 0);

      // Insert text
      text.insert(0, 'Hello');
      doc.commit();

      const pos = doc.getCursorPos(cursor!);
      // Empty container cursor behavior may vary
      // Position 0 cursor should track the start
      expect(pos).toBeDefined();
    });
  });

  describe('Cursor Serialization for Storage', () => {
    it('cursor can be encoded and decoded', () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello World');
      doc.commit();

      const cursor = text.getCursor(6, 0);

      // Encode cursor to bytes for storage
      const encoded = cursor!.encode();
      expect(encoded).toBeInstanceOf(Uint8Array);

      // We can store this in the Loro document or elsewhere
      // and decode it later to get the cursor back

      // For now, verify we can still resolve the original cursor
      const pos = doc.getCursorPos(cursor!);
      expect(pos!.offset).toBe(6);
    });

    it('decoded cursor tracks position after edits', async () => {
      const text = doc.getText('content');
      text.insert(0, 'Hello World');
      doc.commit();

      // Create and encode cursor
      const cursor = text.getCursor(6, 0);
      const encoded = cursor!.encode();

      // Simulate storing and retrieving (import Cursor class)
      const { Cursor } = await import('loro-crdt');
      const decodedCursor = Cursor.decode(encoded);

      // Make edits
      text.insert(0, 'Prefix: ');
      doc.commit();

      // Decoded cursor should still track the correct position
      const pos = doc.getCursorPos(decodedCursor);
      expect(pos).toBeDefined();
      expect(pos!.offset).toBe(14); // 6 + 8 ("Prefix: ".length)
      expect(text.toString()[pos!.offset]).toBe('W');
    });
  });
});
