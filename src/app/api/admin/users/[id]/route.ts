import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaAny } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permissions";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { normalizeLocale } from "@/lib/i18n/constants";
import { isValidNationalId, normalizeNationalId } from "@/lib/employees/national-id";

function isPermKey(p: string): p is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(p);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSessionFromCookie();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }

  const body = (await req.json()) as {
    fullName?: string;
    email?: string;
    nationalId?: string | null;
    phone?: string | null;
    password?: string;
    role?: string;
    permissions?: string[];
    isActive?: boolean;
    hourlyRate?: number;
    language?: string;
    mustChangePassword?: boolean;
  };

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  let normalizedNid: string | null | undefined = undefined;
  if (body.nationalId !== undefined) {
    if (body.nationalId === null || body.nationalId === "") {
      normalizedNid = null;
    } else {
      const v = normalizeNationalId(body.nationalId);
      if (!isValidNationalId(v)) {
        return NextResponse.json({ ok: false, error: "תעודת זהות לא תקינה" }, { status: 400 });
      }
      const dup = await prismaAny.user.findFirst({
        where: { nationalId: v, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json(
          { ok: false, error: "תעודת זהות זו כבר רשומה במערכת" },
          { status: 400 },
        );
      }
      normalizedNid = v;
    }
  }
  const phone =
    body.phone === undefined ? undefined : (body.phone?.trim() || null);
  const role =
    body.role === "SUPER_ADMIN"
      ? UserRole.SUPER_ADMIN
      : body.role === "ADMIN"
        ? UserRole.ADMIN
        : body.role === "EMPLOYEE"
          ? UserRole.EMPLOYEE
          : undefined;
  let permUpdate: PermissionKey[] | undefined = Array.isArray(body.permissions)
    ? body.permissions.filter(isPermKey)
    : undefined;
  if (
    (role === UserRole.EMPLOYEE || role === UserRole.ADMIN) &&
    permUpdate === undefined &&
    existing.role === UserRole.SUPER_ADMIN
  ) {
    permUpdate = [];
  }

  const passwordPlain =
    typeof body.password === "string" && body.password.length > 0 ? body.password : null;

  const nextRole = role ?? existing.role;

  try {
    await prisma.$transaction(async (tx) => {
      const userUpdate: {
        fullName?: string;
        email?: string;
        nationalId?: string | null;
        phone?: string | null;
        isActive?: boolean;
        role?: UserRole;
        passwordHash?: string;
        passwordUpdatedAt?: Date;
        mustChangePassword?: boolean;
        hourlyRate?: number;
        language?: string;
      } = {};

      if (fullName) userUpdate.fullName = fullName;
      if (email) userUpdate.email = email;
      if (normalizedNid !== undefined) userUpdate.nationalId = normalizedNid;
      if (phone !== undefined) userUpdate.phone = phone;
      if (typeof body.isActive === "boolean") userUpdate.isActive = body.isActive;
      if (role) userUpdate.role = role;
      if (passwordPlain) {
        userUpdate.passwordHash = await hashPassword(passwordPlain);
        userUpdate.passwordUpdatedAt = new Date();
        // אם המנהל מאפס סיסמה לעובד — בדרך כלל זה כדי שיחליף בכניסה הבאה
        if (body.mustChangePassword === undefined) {
          userUpdate.mustChangePassword = true;
        }
      }
      if (typeof body.mustChangePassword === "boolean") {
        userUpdate.mustChangePassword = body.mustChangePassword;
      }
      if (typeof body.hourlyRate === "number" && Number.isFinite(body.hourlyRate)) {
        userUpdate.hourlyRate = body.hourlyRate;
      }
      if (body.language !== undefined) {
        userUpdate.language = normalizeLocale(body.language);
      }

      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({
          where: { id },
          data: userUpdate as Record<string, unknown>,
        });
      }

      if (nextRole === UserRole.SUPER_ADMIN) {
        await tx.userPermission.deleteMany({ where: { userId: id } });
      } else if (
        (nextRole === UserRole.EMPLOYEE || nextRole === UserRole.ADMIN) &&
        permUpdate !== undefined
      ) {
        await tx.userPermission.deleteMany({ where: { userId: id } });
        if (permUpdate.length > 0) {
          await tx.userPermission.createMany({
            data: permUpdate.map((permission) => ({ userId: id, permission })),
          });
        }
      }
    });

    await logActivity(session.sub, "user_update");

    const updated = await prismaAny.user.findUnique({
      where: { id },
      include: { permissions: true },
    }) as {
      id: string;
      fullName: string;
      email: string;
      nationalId: string | null;
      phone: string | null;
      role: UserRole;
      isActive: boolean;
      hourlyRate: number;
      mustChangePassword: boolean;
      permissions: { permission: string }[];
    } | null;

    return NextResponse.json({
      ok: true,
      data: updated
        ? {
            id: updated.id,
            fullName: updated.fullName,
            email: updated.email,
            nationalId: updated.nationalId,
            phone: updated.phone,
            role: updated.role,
            isActive: updated.isActive,
            hourlyRate: updated.hourlyRate,
            mustChangePassword: updated.mustChangePassword,
            permissions: updated.permissions.map((p) => p.permission),
          }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
      if (msg.toLowerCase().includes("nationalid")) {
        return NextResponse.json({ ok: false, error: "תעודת זהות זו כבר רשומה" }, { status: 400 });
      }
      return NextResponse.json({ ok: false, error: "אימייל כבר קיים" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "שגיאה בעדכון" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSessionFromCookie();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  if (session.sub === id) {
    return NextResponse.json({ ok: false, error: "לא ניתן למחוק את המשתמש הנוכחי" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  await logActivity(session.sub, "user_delete");

  return NextResponse.json({ ok: true });
}
