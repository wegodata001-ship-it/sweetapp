import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { listEmployeesForWorkOrder } from "@/lib/work-tasks/list-work-employees";

/**
 * ברירת מחדל: רשומות Employee (כרטסות).
 * ?forTasks=1 — משתמשי EMPLOYEE / ADMIN (User id) — workflow runs ישנים.
 * ?forWorkOrder=1 — כרטיס Employee + מנהלים לסדר עבודה יומי.
 */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const forWorkOrder = req.nextUrl.searchParams.get("forWorkOrder") === "1";
  if (forWorkOrder) {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    try {
      const rows = await listEmployeesForWorkOrder();
      return NextResponse.json({ ok: true, data: rows });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
        { status: 500 },
      );
    }
  }
  const forTasks = req.nextUrl.searchParams.get("forTasks") === "1";
  if (forTasks) {
    const session = await getSessionFromCookie();
    if (!session || !canManageAllTasks(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    try {
      const rows = await prisma.user.findMany({
        where: {
          role: { in: [UserRole.EMPLOYEE, UserRole.ADMIN, UserRole.SUPER_ADMIN] },
          isActive: true,
        },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      });
      return NextResponse.json({ ok: true, data: rows });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
        { status: 500 },
      );
    }
  }
  try {
    const rows = await prisma.employee.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as {
      name: string;
      phone?: string | null;
      openingBalance?: number;
      role?: string | null;
      department?: string | null;
    };
    if (!body.name?.trim()) return NextResponse.json({ ok: false, error: "חסר שם" }, { status: 400 });
    const row = await prisma.employee.create({
      data: {
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        openingBalance: body.openingBalance ?? 0,
        role: body.role?.trim() || null,
        department: body.department?.trim() || null,
      } as never,
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
