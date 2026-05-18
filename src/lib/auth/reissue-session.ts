import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import { COOKIE_NAME, signSessionToken } from "@/lib/auth/jwt";
import { getPermissionStringsForUser } from "@/lib/auth/user-permissions";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

/** Re-sign JWT from DB (e.g. after password change) and attach Set-Cookie. */
export async function appendRefreshedSessionCookie(res: NextResponse, userId: string): Promise<boolean> {
  const user = await prismaAny.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, isActive: true, mustChangePassword: true },
  });
  if (!user || !user.isActive) return false;
  const permissions = await getPermissionStringsForUser(user.id, user.role as UserRole);
  const token = await signSessionToken({
    sub: user.id,
    email: user.email,
    role: user.role as UserRole,
    permissions,
    mustChangePassword: Boolean(user.mustChangePassword),
  });
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
  return true;
}
