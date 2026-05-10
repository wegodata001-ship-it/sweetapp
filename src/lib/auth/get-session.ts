import { cookies } from "next/headers";
import { verifySessionToken, COOKIE_NAME, type SessionJwtPayload } from "@/lib/auth/jwt";

export async function getSessionFromCookie(): Promise<SessionJwtPayload | null> {
  const c = await cookies();
  const t = c.get(COOKIE_NAME)?.value;
  if (!t) return null;
  return verifySessionToken(t);
}
