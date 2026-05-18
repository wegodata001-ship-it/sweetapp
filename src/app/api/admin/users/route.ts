import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permissions";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { normalizeLocale } from "@/lib/i18n/constants";
import { logActivity } from "@/lib/activity-log";
import {
  buildInternalEmail,
  isValidNationalId,
  normalizeNationalId,
} from "@/lib/employees/national-id";

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
      nationalId: u.nationalId,
      phone: u.phone,
      role: u.role,
      isActive: u.isActive,
      hourlyRate: u.hourlyRate,
      createdAt: u.createdAt.toISOString(),
      mustChangePassword: u.mustChangePassword,
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
    nationalId?: string;
    phone?: string;
    password?: string;
    role?: string;
    permissions?: string[];
    isActive?: boolean;
    hourlyRate?: number;
    language?: string;
    mustChangePassword?: boolean;
  };

  const fullName = body.fullName?.trim();
  let email = body.email?.trim().toLowerCase() || "";
  const password = body.password;
  const role =
    body.role === "SUPER_ADMIN" ? UserRole.SUPER_ADMIN
    : body.role === "ADMIN" ? UserRole.ADMIN
    : UserRole.EMPLOYEE;
  const perms = Array.isArray(body.permissions) ? body.permissions.filter(isPermKey) : [];
  const hourlyRate =
    typeof body.hourlyRate === "number" && Number.isFinite(body.hourlyRate) ? body.hourlyRate : 0;
  const phone = body.phone?.trim() || null;
  const nationalId = normalizeNationalId(body.nationalId);

  if (!fullName || !password) {
    return NextResponse.json({ ok: false, error: "שם וסיסמה נדרשים" }, { status: 400 });
  }

  // עובדים מתחברים לפי תעודת זהות — חובה
  if (role === UserRole.EMPLOYEE && !nationalId) {
    return NextResponse.json({ ok: false, error: "תעודת זהות חובה לעובד" }, { status: 400 });
  }
  if (nationalId && !isValidNationalId(nationalId)) {
    return NextResponse.json({ ok: false, error: "תעודת זהות לא תקינה" }, { status: 400 });
  }
  if (nationalId) {
    const exists = await prisma.user.findFirst({ where: { nationalId } });
    if (exists) {
      return NextResponse.json(
        { ok: false, error: "תעודת זהות זו כבר רשומה במערכת" },
        { status: 400 },
      );
    }
  }

  // אם אין אימייל — נייצר אימייל פנימי תקני (יחיד) מתעודת הזהות
  if (!email) {
    if (!nationalId) {
      return NextResponse.json({ ok: false, error: "אימייל או תעודת זהות חובה" }, { status: 400 });
    }
    email = buildInternalEmail(nationalId);
  }

  const language = body.language !== undefined ? normalizeLocale(body.language) : undefined;

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        nationalId: nationalId || null,
        phone,
        passwordHash,
        passwordUpdatedAt: new Date(),
        mustChangePassword:
          role === UserRole.EMPLOYEE ? body.mustChangePassword !== false : body.mustChangePassword === true,
        role,
        hourlyRate,
        isActive: body.isActive !== false,
        ...(language !== undefined ? { language } : {}),
        permissions:
          role === UserRole.EMPLOYEE || role === UserRole.ADMIN
            ? { create: perms.map((permission) => ({ permission })) }
            : undefined,
        ...(role === UserRole.EMPLOYEE
          ? {
              employee: {
                create: {
                  name: fullName,
                  phone: phone,
                  isActive: true,
                },
              },
            }
          : {}),
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
        nationalId: user.nationalId,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        hourlyRate: user.hourlyRate,
        mustChangePassword: user.mustChangePassword,
        permissions: user.permissions.map((p: { permission: string }) => p.permission),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
      // ננסה להבין איזה שדה
      if (msg.toLowerCase().includes("nationalid")) {
        return NextResponse.json({ ok: false, error: "תעודת זהות זו כבר רשומה" }, { status: 400 });
      }
      return NextResponse.json({ ok: false, error: "אימייל כבר קיים" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "שגיאה בשמירה" }, { status: 500 });
  }
}
