import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import {
  deleteEmployeeTaskGroupManager,
  duplicateEmployeeTaskGroupManager,
  loadEmployeeWorkDay,
  updateEmployeeTaskGroupManager,
} from "@/lib/work-tasks/employee-work-service";
import { prisma, prismaAny } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as { title?: string; color?: string | null };
  try {
    const before = await prismaAny.employeeTaskGroup.findUnique({
      where: { id },
      select: { employeeId: true, workDate: true },
    });
    if (!before) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    await updateEmployeeTaskGroupManager(id, body);
    const date =
      before.workDate instanceof Date ? before.workDate.toISOString().slice(0, 10) : undefined;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH employee-work group]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const g = await prismaAny.employeeTaskGroup.findUnique({
      where: { id },
      select: { employeeId: true, workDate: true },
    });
    if (!g) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    await deleteEmployeeTaskGroupManager(id, strictUserId(session));
    const date = g.workDate instanceof Date ? g.workDate.toISOString().slice(0, 10) : undefined;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE employee-work group]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as { action?: string; date?: string };
  if (body.action !== "duplicate") {
    return NextResponse.json({ ok: false, error: "פעולה לא נתמכת" }, { status: 400 });
  }
  try {
    const g = await prismaAny.employeeTaskGroup.findUnique({
      where: { id },
      select: { employeeId: true },
    });
    if (!g) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    await duplicateEmployeeTaskGroupManager(id, body.date);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST employee-work group duplicate]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
