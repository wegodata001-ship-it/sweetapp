import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBootstrapSuperAdmin } from "@/lib/auth/bootstrap";
import { verifyPassword } from "@/lib/auth/password";
import { signSessionToken, COOKIE_NAME } from "@/lib/auth/jwt";
import { PERMISSION_KEYS } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/activity-log";
import { UserRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    await ensureBootstrapSuperAdmin();

    const body = (await req.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "אימייל וסיסמה נדרשים" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return NextResponse.json({ ok: false, error: "פרטי התחברות שגויים" }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "פרטי התחברות שגויים" }, { status: 401 });
    }

    let permissions: string[] = [];
    if (user.role === UserRole.SUPER_ADMIN) {
      permissions = [...PERMISSION_KEYS];
    } else {
      const rows = await prisma.userPermission.findMany({
        where: { userId: user.id },
        select: { permission: true },
      });
      permissions = rows.map((r) => r.permission);
    }

    const token = await signSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions,
    });

    await logActivity(user.id, "login");

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        permissions,
      },
    });

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
