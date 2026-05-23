import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { prismaAny } from "@/lib/prisma";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth/jwt";
import { appendRefreshedSessionCookie } from "@/lib/auth/reissue-session";
import { getPermissionStringsForUser } from "@/lib/auth/user-permissions";

const FAST_HEADERS = { "Cache-Control": "private, max-age=15" };

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ ok: true, user: null });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ ok: true, user: null });
  }

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
  } | null;

  if (!user || !user.isActive) {
    return NextResponse.json({ ok: true, user: null });
  }

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
      },
    });
    await appendRefreshedSessionCookie(res, {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      permissions,
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
      },
    },
    { headers: FAST_HEADERS },
  );
}
