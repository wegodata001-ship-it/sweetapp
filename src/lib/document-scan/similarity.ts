/** Normalize for Hebrew fuzzy match (OCR / supplier names). */
export function normalizeSimilarityText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u0591-\u05C7\u064B-\u0652]/g, "")
    .replace(/["'״׳.,\-_/()[\]{}!?:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function levenshtein(a: string, b: string): number {
  const s = normalizeSimilarityText(a);
  const t = normalizeSimilarityText(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const m = s.length;
  const n = t.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

/** Score in [0, 1] — 1 = identical. */
export function stringSimilarity(a: string, b: string): number {
  const na = normalizeSimilarityText(a);
  const nb = normalizeSimilarityText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.88;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

export type RankedMatch<T> = T & { score: number };

export function rankBySimilarity<T>(
  query: string,
  items: T[],
  getLabel: (item: T) => string,
  minScore = 0.42,
): RankedMatch<T>[] {
  const q = query.trim();
  if (!q) return [];
  return items
    .map((item) => ({ ...item, score: stringSimilarity(q, getLabel(item)) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);
}
