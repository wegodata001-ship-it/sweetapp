import { prismaAny } from "@/lib/prisma";
import type { SessionJwtPayload } from "@/lib/auth/jwt";

export const SESSION_SUPERSEDED_CODE = "SESSION_SUPERSEDED";

function newSessionId(): string {
  return globalThis.crypto.randomUUID();
}

const CACHE_TTL_MS = 3000;

type BindingCacheEntry = {
  currentSessionId: string | null;
  isActive: boolean;
  at: number;
};

const bindingCache = new Map<string, BindingCacheEntry>();

export function invalidateSessionBindingCache(userId: string): void {
  bindingCache.delete(userId);
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

export async function createUserSession(
  userId: string,
  meta: { ip: string | null; device: string },
): Promise<string> {
  const sessionId = newSessionId();
  invalidateSessionBindingCache(userId);
  await prismaAny.user.update({
    where: { id: userId },
    data: {
      currentSessionId: sessionId,
      lastLoginAt: new Date(),
      lastLoginIp: meta.ip,
      lastDevice: meta.device,
    },
  });
  return sessionId;
}

/** מחליף session ID בלי לעדכן lastLogin — שינוי סיסמה / reissue */
export async function rotateUserSessionId(userId: string): Promise<string> {
  const sessionId = newSessionId();
  invalidateSessionBindingCache(userId);
  await prismaAny.user.update({
    where: { id: userId },
    data: { currentSessionId: sessionId },
  });
  return sessionId;
}

export async function clearUserSession(userId: string): Promise<void> {
  invalidateSessionBindingCache(userId);
  await prismaAny.user.update({
    where: { id: userId },
    data: { currentSessionId: null },
  });
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
    currentSessionId: row?.currentSessionId ?? null,
    isActive: row?.isActive ?? false,
    at: now,
  };
  bindingCache.set(userId, entry);
  return entry;
}

export type SessionValidationResult =
  | { ok: true; session: SessionJwtPayload }
  | { ok: false; reason: "missing" | "invalid" | "inactive" | "superseded" };

export async function validateSessionBinding(
  payload: SessionJwtPayload | null,
): Promise<SessionValidationResult> {
  if (!payload) return { ok: false, reason: "missing" };
  if (!payload.sid) return { ok: false, reason: "invalid" };

  const binding = await loadBinding(payload.sub);
  if (!binding.isActive) return { ok: false, reason: "inactive" };
  if (!binding.currentSessionId || binding.currentSessionId !== payload.sid) {
    return { ok: false, reason: "superseded" };
  }

  return { ok: true, session: payload };
}
