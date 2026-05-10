import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permissions";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";

function isPermKey(p: string): p is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(p);
}

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { permissions: true },
  });

  return NextResponse.json({
    ok: true,
    data: users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      permissions: u.permissions.map((p) => p.permission),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const body = (await req.json()) as {
    fullName?: string;
    email?: string;
    password?: string;
    role?: string;
    permissions?: string[];
    isActive?: boolean;
  };

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const role = body.role === "SUPER_ADMIN" ? UserRole.SUPER_ADMIN : UserRole.EMPLOYEE;
  const perms = Array.isArray(body.permissions) ? body.permissions.filter(isPermKey) : [];

  if (!fullName || !email || !password) {
    return NextResponse.json({ ok: false, error: "שם, אימייל וסיסמה נדרשים" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role,
        isActive: body.isActive !== false,
        permissions:
          role === UserRole.EMPLOYEE
            ? { create: perms.map((permission) => ({ permission })) }
            : undefined,
      },
      include: { permissions: true },
    });

    await logActivity(session.sub, "user_create");

    return NextResponse.json({
      ok: true,
      data: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        permissions: user.permissions.map((p) => p.permission),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
      return NextResponse.json({ ok: false, error: "אימייל כבר קיים" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "שגיאה בשמירה" }, { status: 500 });
  }
}
