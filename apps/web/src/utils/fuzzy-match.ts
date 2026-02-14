/**
 * Returns a score >= 0 if query is a fuzzy subsequence of target, or -1 if no match.
 * Higher scores indicate better matches. Consecutive character matches and
 * matches at word boundaries score higher.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return 0;
  if (q.length > t.length) return -1;

  let score = 0;
  let qi = 0;
  let prevMatchIndex = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      if (ti === prevMatchIndex + 1) score += 2;
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-' || t[ti - 1] === '.') score += 3;
      prevMatchIndex = ti;
      qi++;
    }
  }

  return qi === q.length ? score : -1;
}

/**
 * Returns true if query fuzzy-matches target.
 */
export function fuzzyMatch(query: string, target: string): boolean {
  return fuzzyScore(query, target) >= 0;
}
