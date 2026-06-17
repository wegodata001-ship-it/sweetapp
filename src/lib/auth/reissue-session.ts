import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import { COOKIE_NAME, signSessionToken } from "@/lib/auth/jwt";
import { getPermissionStringsForUser } from "@/lib/auth/user-permissions";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export type SessionReissueUser = {
  id: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  permissions?: string[];
  sid?: string;
};

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Re-sign JWT and attach Set-Cookie — permissions אופציונליים (כבר נטענו ב-sync). */
export async function appendRefreshedSessionCookie(
  res: NextResponse,
  user: SessionReissueUser | string,
): Promise<boolean> {
  const base =
    typeof user === "string"
      ? await prismaAny.user.findUnique({
          where: { id: user },
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            mustChangePassword: true,
            currentSessionId: true,
          },
        })
      : null;

  const row =
    typeof user === "string"
      ? base
      : {
          id: user.id,
          email: user.email,
          role: user.role,
          isActive: true,
          mustChangePassword: user.mustChangePassword,
          currentSessionId: user.sid ?? null,
        };

  if (!row || (typeof user === "string" && !row.isActive)) return false;

  const sid =
    typeof user !== "string" && user.sid
      ? user.sid
      : (row as { currentSessionId: string | null }).currentSessionId;
  if (!sid) return false;

  const permissions =
    typeof user !== "string" && user.permissions
      ? user.permissions
      : await getPermissionStringsForUser(row.id, row.role as UserRole);

  const token = await signSessionToken({
    sub: row.id,
    email: row.email,
    role: row.role as UserRole,
    permissions,
    sid,
    mustChangePassword: Boolean(row.mustChangePassword),
  });
  res.cookies.set(COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  return true;
}
