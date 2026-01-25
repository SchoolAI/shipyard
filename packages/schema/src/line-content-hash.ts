/**
 * Simple hash function for line content staleness detection.
 * Not cryptographic - just for quick equality checking.
 */
export function hashLineContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
