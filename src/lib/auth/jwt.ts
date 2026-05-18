import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";

const COOKIE_NAME = "wego_session";

export type SessionJwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  permissions: string[];
  /** When true, middleware blocks the app until the user changes password. */
  mustChangePassword?: boolean;
};

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET?.trim();
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signSessionToken(payload: SessionJwtPayload, maxAgeSec = 60 * 60 * 24 * 7): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    permissions: payload.permissions,
    mustChangePassword: Boolean(payload.mustChangePassword),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : "";
    const role = payload.role as UserRole;
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions.filter((p): p is string => typeof p === "string")
      : [];
    if (!sub || !email || !role) return null;
    const mustChangePassword = payload.mustChangePassword === true;
    return { sub, email, role, permissions, mustChangePassword };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
