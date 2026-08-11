/**
 * Cache זיכרון + dedupe ל-fetch בצד לקוח — מפחית קריאות כפולות (Strict Mode, מספר bells).
 */

type Entry<T> = { data: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

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
  /** מבטל dedupe — קריאה חדשה לא תחכה ל־Promise ישן (למשל /me לפני login) */
  inflight.delete(key);
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

/** טוען פעם אחת לכל מפתח — מחכה ל-Promise קיים אם כבר רץ */
export async function fetchWithDedupe<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== null) return hit;

  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    const slot: { current?: Promise<T> } = {};
    const loaded = loader().then((data) => {
      /**
       * אם המפתח בוטל באמצע (login / logout) — לא לשמור cache מיושן.
       * הקורא עדיין מקבל את התוצאה; AuthProvider מתעלם ממנה עם generation.
       */
      if (inflight.get(key) === slot.current && ttlMs > 0) {
        setCached(key, data, ttlMs);
      }
      return data;
    });
    slot.current = loaded.finally(() => {
      if (inflight.get(key) === slot.current) inflight.delete(key);
    });
    pending = slot.current;
    inflight.set(key, pending);
  }

  return pending;
}

export async function fetchJsonCached<T>(
  key: string,
  url: string,
  ttlMs: number,
  init?: RequestInit,
): Promise<T | null> {
  return fetchWithDedupe<T | null>(
    key,
    async () => {
      const res = await fetch(url, { credentials: "same-origin", ...init });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T } | null;
      if (!json?.ok || json.data === undefined) return null;
      return json.data;
    },
    ttlMs,
  );
}
