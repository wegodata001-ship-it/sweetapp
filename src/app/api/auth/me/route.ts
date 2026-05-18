import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { prismaAny } from "@/lib/prisma";
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
      employeeId: true,
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
    employeeId: string | null;
    language: string;
    mustChangePassword: boolean;
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
