import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { prismaAny } from "@/lib/prisma";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth/jwt";
import { appendRefreshedSessionCookie, clearSessionCookie } from "@/lib/auth/reissue-session";
import { getPermissionStringsForUser } from "@/lib/auth/user-permissions";
import {
  SESSION_SUPERSEDED_CODE,
  validateSessionBinding,
} from "@/lib/auth/session-binding";

const FAST_HEADERS = { "Cache-Control": "private, max-age=15" };

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ ok: true, user: null });
  }

  const jwtPayload = await verifySessionToken(token);
  const binding = await validateSessionBinding(jwtPayload);

  if (!binding.ok) {
    const res = NextResponse.json({
      ok: true,
      user: null,
      code: binding.reason === "superseded" ? SESSION_SUPERSEDED_CODE : undefined,
    });
    if (binding.reason === "superseded" || binding.reason === "inactive") {
      clearSessionCookie(res);
    }
    return res;
  }

  const session = binding.session;
  const sync = req.nextUrl.searchParams.get("sync") === "1";

  const user = (await prismaAny.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      fullName: true,
      email: true,
      nationalId: true,
      phone: true,
      role: true,
      isActive: true,
      hourlyRate: true,
      language: true,
      mustChangePassword: true,
      lastLoginAt: true,
      lastLoginIp: true,
      lastDevice: true,
    },
  })) as {
    id: string;
    fullName: string;
    email: string;
    nationalId: string | null;
    phone: string | null;
    role: UserRole;
    isActive: boolean;
    hourlyRate: number;
    language: string;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
    lastLoginIp: string | null;
    lastDevice: string | null;
  } | null;

  if (!user || !user.isActive) {
    const res = NextResponse.json({ ok: true, user: null });
    clearSessionCookie(res);
    return res;
  }

  const lastLogin = {
    at: user.lastLoginAt?.toISOString() ?? null,
    ip: user.lastLoginIp ?? null,
    device: user.lastDevice ?? null,
  };

  if (sync) {
    const permissions = await getPermissionStringsForUser(user.id, user.role);
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        nationalId: user.nationalId,
        phone: user.phone,
        role: user.role,
        hourlyRate: user.hourlyRate,
        language: user.language,
        mustChangePassword: user.mustChangePassword,
        permissions,
        lastLogin,
      },
    });
    await appendRefreshedSessionCookie(res, {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      permissions,
      sid: session.sid,
    });
    return res;
  }

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        nationalId: user.nationalId,
        phone: user.phone,
        role: user.role,
        hourlyRate: user.hourlyRate,
        language: user.language,
        mustChangePassword: user.mustChangePassword,
        permissions: session.permissions,
        lastLogin,
      },
    },
    { headers: FAST_HEADERS },
  );
}
