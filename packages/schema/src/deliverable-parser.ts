import type { Deliverable } from './plan.js';

/**
 * Marker used to identify deliverables in BlockNote content.
 * Example: "- [ ] Screenshot of login page {#deliverable}"
 */
export const DELIVERABLE_MARKER = '{#deliverable}';

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
    const text = extractTextFromBlock(block);

    if (text.includes(DELIVERABLE_MARKER)) {
      const markerRegex = new RegExp(
        `\\s*${DELIVERABLE_MARKER.replace(/[{}#]/g, '\\$&')}\\s*`,
        'g'
      );
      const cleanText = text.replace(markerRegex, '').trim();

      deliverables.push({
        id: block.id,
        text: cleanText,
      });
    }

    if (block.children && Array.isArray(block.children)) {
      for (const child of block.children) {
        processBlock(child as Block);
      }
    }
  }

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
