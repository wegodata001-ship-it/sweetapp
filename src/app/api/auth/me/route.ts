import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ensureBootstrapSuperAdmin } from "@/lib/auth/bootstrap";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth/jwt";

export async function GET() {
  await ensureBootstrapSuperAdmin();

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ ok: true, user: null });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ ok: true, user: null });
  }

  const user = (await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      employeeId: true,
    } as never,
  })) as {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    employeeId: string | null;
  } | null;

  if (!user || !user.isActive) {
    return NextResponse.json({ ok: true, user: null });
  }

  return NextResponse.json({
    ok: true,
    user: {
      ...user,
      permissions: session.permissions,
    },
  });
}
