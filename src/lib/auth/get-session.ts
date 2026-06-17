import { cookies } from "next/headers";
import { verifySessionToken, COOKIE_NAME, type SessionJwtPayload } from "@/lib/auth/jwt";
import {
  validateSessionBinding,
  type SessionValidationResult,
} from "@/lib/auth/session-binding";

export async function getValidatedSessionFromCookie(): Promise<SessionValidationResult> {
  const c = await cookies();
  const t = c.get(COOKIE_NAME)?.value;
  if (!t) return { ok: false, reason: "missing" };
  const payload = await verifySessionToken(t);
  return validateSessionBinding(payload);
}

export async function getSessionFromCookie(): Promise<SessionJwtPayload | null> {
  const result = await getValidatedSessionFromCookie();
  return result.ok ? result.session : null;
}
