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
    password?: string;
    role?: string;
    permissions?: string[];
    isActive?: boolean;
  };

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const role =
    body.role === "SUPER_ADMIN"
      ? UserRole.SUPER_ADMIN
      : body.role === "EMPLOYEE"
        ? UserRole.EMPLOYEE
        : undefined;
  let permUpdate: PermissionKey[] | undefined = Array.isArray(body.permissions)
    ? body.permissions.filter(isPermKey)
    : undefined;
  if (role === UserRole.EMPLOYEE && permUpdate === undefined && existing.role === UserRole.SUPER_ADMIN) {
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
        isActive?: boolean;
        role?: UserRole;
        passwordHash?: string;
      } = {};

      if (fullName) userUpdate.fullName = fullName;
      if (email) userUpdate.email = email;
      if (typeof body.isActive === "boolean") userUpdate.isActive = body.isActive;
      if (role) userUpdate.role = role;
      if (passwordPlain) userUpdate.passwordHash = await hashPassword(passwordPlain);

      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({
          where: { id },
          data: userUpdate,
        });
      }

      if (nextRole === UserRole.SUPER_ADMIN) {
        await tx.userPermission.deleteMany({ where: { userId: id } });
      } else if (nextRole === UserRole.EMPLOYEE && permUpdate !== undefined) {
        await tx.userPermission.deleteMany({ where: { userId: id } });
        if (permUpdate.length > 0) {
          await tx.userPermission.createMany({
            data: permUpdate.map((permission) => ({ userId: id, permission })),
          });
        }
      }
    });

    await logActivity(session.sub, "user_update");

    const updated = await prisma.user.findUnique({
      where: { id },
      include: { permissions: true },
    });

    return NextResponse.json({
      ok: true,
      data: updated
        ? {
            id: updated.id,
            fullName: updated.fullName,
            email: updated.email,
            role: updated.role,
            isActive: updated.isActive,
            permissions: updated.permissions.map((p) => p.permission),
          }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
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
