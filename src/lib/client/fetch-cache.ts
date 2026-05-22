/**
 * Cache זיכרון פשוט ל-fetch בצד לקוח — מפחית רענונים כפולים.
 */

type Entry<T> = { data: T; expires: number };

const store = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string): T | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit || hit.expires < Date.now()) return null;
  return hit.data;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expires: Date.now() + ttlMs });
}

export function invalidateCacheKey(key: string): void {
  store.delete(key);
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

export async function fetchJsonCached<T>(
  key: string,
  url: string,
  ttlMs: number,
  init?: RequestInit,
): Promise<T | null> {
  const hit = getCached<T>(key);
  if (hit) return hit;
  const res = await fetch(url, { credentials: "same-origin", ...init });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T } | null;
  if (!json?.ok || json.data === undefined) return null;
  setCached(key, json.data, ttlMs);
  return json.data;
}
