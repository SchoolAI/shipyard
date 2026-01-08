import type { Deliverable } from './plan.js';

/**
 * BlockNote block structure (simplified).
 * We only care about checkListItem blocks with {#deliverable} marker.
 * This is a minimal interface that matches BlockNote's actual Block type.
 */
interface Block {
  id: string;
  type: string;
  content?: Array<{ type: string; text: string; styles?: Record<string, unknown> }> | unknown;
  children?: Block[] | unknown;
}

/**
 * Extracts deliverables from BlockNote blocks.
 * Looks for checkListItem blocks with {#deliverable} marker in the text.
 *
 * Example:
 * - [ ] Screenshot of login page {#deliverable}
 * - [ ] Regular task (not a deliverable)
 *
 * @param blocks - BlockNote blocks array
 * @returns Array of deliverables extracted from marked checkboxes
 */
export function extractDeliverables(blocks: Block[]): Deliverable[] {
  const deliverables: Deliverable[] = [];

  function processBlock(block: Block): void {
    // Extract text from content array
    const text = extractTextFromBlock(block);

    // Check if it has {#deliverable} marker
    // Works with both checkListItem and bulletListItem (markdown "- [ ]" syntax)
    if (text.includes('{#deliverable}')) {
      // Remove the marker from display text
      const cleanText = text.replace(/\s*\{#deliverable\}\s*/g, '').trim();

      deliverables.push({
        id: block.id,
        text: cleanText,
      });
    }

    // Recursively process children
    if (block.children && Array.isArray(block.children)) {
      for (const child of block.children) {
        processBlock(child as Block);
      }
    }
  }

  // Process all top-level blocks
  for (const block of blocks) {
    processBlock(block);
  }

  return deliverables;
}

/**
 * Extracts plain text from a BlockNote block's content array.
 */
function extractTextFromBlock(block: Block): string {
  if (!block.content || !Array.isArray(block.content) || block.content.length === 0) {
    return '';
  }

  return block.content
    .map((item: { text?: string }) => item.text || '')
    .join('')
    .trim();
}
