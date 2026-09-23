import type { UserRole } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import type { SessionJwtPayload } from "@/lib/auth/jwt";

export const SESSION_SUPERSEDED_CODE = "SESSION_SUPERSEDED";

/** Soft cap so a leaked login loop cannot grow the list without bound. Oldest IDs drop first. */
export const ADMIN_SESSION_SOFT_CAP = 40;

function newSessionId(): string {
  return globalThis.crypto.randomUUID();
}

const CACHE_TTL_MS = 3000;

type BindingCacheEntry = {
  sessionIds: string[];
  isActive: boolean;
  at: number;
};

const bindingCache = new Map<string, BindingCacheEntry>();

export function invalidateSessionBindingCache(userId: string): void {
  bindingCache.delete(userId);
}

export function allowsMultipleAuthSessions(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function parseActiveSessionIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
    } catch {
      return [];
    }
  }
  return [trimmed];
}

export function serializeActiveSessionIds(ids: string[]): string | null {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0] ?? null;
  return JSON.stringify(unique);
}

export function sessionIdsAfterLogin(
  existing: string[],
  newId: string,
  allowMultiple: boolean,
): string[] {
  if (!allowMultiple) return [newId];
  const next = existing.filter((id) => id !== newId);
  next.push(newId);
  if (next.length > ADMIN_SESSION_SOFT_CAP) {
    return next.slice(next.length - ADMIN_SESSION_SOFT_CAP);
  }
  return next;
}

export function sessionIdsAfterLogout(existing: string[], sid: string): string[] {
  return existing.filter((id) => id !== sid);
}

export function isSidBound(existing: string[], sid: string | null | undefined): boolean {
  return Boolean(sid && existing.includes(sid));
}

export function parseDeviceFromUserAgent(ua: string | null): string {
  if (!ua) return "—";
  const s = ua.toLowerCase();
  if (s.includes("iphone")) return "iPhone";
  if (s.includes("ipad")) return "iPad";
  if (s.includes("android")) return "Android";
  if (s.includes("windows")) return "Windows";
  if (s.includes("mac os") || s.includes("macintosh")) return "Mac";
  if (s.includes("linux")) return "Linux";
  return ua.length > 80 ? `${ua.slice(0, 77)}…` : ua;
}

export function requestClientMeta(headers: Headers): { ip: string | null; device: string } {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null;
  const device = parseDeviceFromUserAgent(headers.get("user-agent"));
  return { ip, device };
}

async function readStoredSessionIds(userId: string): Promise<string[]> {
  const row = (await prismaAny.user.findUnique({
    where: { id: userId },
    select: { currentSessionId: true },
  })) as { currentSessionId: string | null } | null;
  return parseActiveSessionIds(row?.currentSessionId);
}

async function writeStoredSessionIds(
  userId: string,
  ids: string[],
  extra?: { lastLoginAt?: Date; lastLoginIp?: string | null; lastDevice?: string },
): Promise<void> {
  invalidateSessionBindingCache(userId);
  await prismaAny.user.update({
    where: { id: userId },
    data: {
      currentSessionId: serializeActiveSessionIds(ids),
      ...extra,
    },
  });
}

export async function createUserSession(
  userId: string,
  meta: { ip: string | null; device: string },
  options?: { allowMultiple?: boolean; role?: UserRole | string },
): Promise<string> {
  const sessionId = newSessionId();
  const allowMultiple =
    options?.allowMultiple ?? allowsMultipleAuthSessions(options?.role);
  const existing = allowMultiple ? await readStoredSessionIds(userId) : [];
  const next = sessionIdsAfterLogin(existing, sessionId, allowMultiple);
  await writeStoredSessionIds(userId, next, {
    lastLoginAt: new Date(),
    lastLoginIp: meta.ip,
    lastDevice: meta.device,
  });
  return sessionId;
}

/** מחליף את כל ה-sessions ב-ID חדש — שינוי סיסמה / reissue */
export async function rotateUserSessionId(userId: string): Promise<string> {
  const sessionId = newSessionId();
  await writeStoredSessionIds(userId, [sessionId]);
  return sessionId;
}

/** מבטל את כל ה-sessions של המשתמש (password reset / force logout all). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await writeStoredSessionIds(userId, []);
}

/** תאימות: ניתוק כללי — לא לשימוש ב-logout רגיל. */
export async function clearUserSession(userId: string): Promise<void> {
  await revokeAllUserSessions(userId);
}

/** Logout רגיל — מבטל רק את ה-session הנוכחי. */
export async function revokeUserSession(userId: string, sid: string): Promise<void> {
  const existing = await readStoredSessionIds(userId);
  await writeStoredSessionIds(userId, sessionIdsAfterLogout(existing, sid));
}

async function loadBinding(userId: string): Promise<BindingCacheEntry> {
  const now = Date.now();
  const cached = bindingCache.get(userId);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached;
  }

  const row = (await prismaAny.user.findUnique({
    where: { id: userId },
    select: { currentSessionId: true, isActive: true },
  })) as { currentSessionId: string | null; isActive: boolean } | null;

  const entry: BindingCacheEntry = {
    sessionIds: parseActiveSessionIds(row?.currentSessionId),
    isActive: row?.isActive ?? false,
    at: now,
  };
  bindingCache.set(userId, entry);
  return entry;
}

export type SessionValidationResult =
  | { ok: true; session: SessionJwtPayload }
  | { ok: false; reason: "missing" | "invalid" | "inactive" | "superseded" };

export function evaluateSessionBinding(
  payload: SessionJwtPayload | null,
  binding: { sessionIds: string[]; isActive: boolean },
): SessionValidationResult {
  if (!payload) return { ok: false, reason: "missing" };
  if (!payload.sid) return { ok: false, reason: "invalid" };
  if (!binding.isActive) return { ok: false, reason: "inactive" };
  if (!isSidBound(binding.sessionIds, payload.sid)) {
    return { ok: false, reason: "superseded" };
  }
  return { ok: true, session: payload };
}

export async function validateSessionBinding(
  payload: SessionJwtPayload | null,
): Promise<SessionValidationResult> {
  if (!payload) return { ok: false, reason: "missing" };
  if (!payload.sid) return { ok: false, reason: "invalid" };
  const binding = await loadBinding(payload.sub);
  return evaluateSessionBinding(payload, binding);
}
