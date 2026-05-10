import { NextResponse } from "next/server";
import { getEmployeeTaskOrm } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { serializeEmployeeTask } from "@/lib/tasks/serialize-task";
import { scheduledStartMs } from "@/lib/tasks/schedule";

const ASSIGNEE_SELECT = { id: true, fullName: true, email: true, role: true } as const;

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const et = getEmployeeTaskOrm();
    const rows = (await et.findMany({
      where: { assigneeId: session.sub },
      include: { assignee: { select: ASSIGNEE_SELECT } },
      orderBy: [{ taskDate: "asc" }, { startTime: "asc" }, { createdAt: "desc" }],
    })) as Parameters<typeof serializeEmployeeTask>[0][];

    const data = rows.map(serializeEmployeeTask);
    const now = Date.now();

    let open = 0;
    let inProgress = 0;
    let completed = 0;
    let urgentOpen = 0;
    let overdueCount = 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    let completedToday = 0;

    for (const r of rows) {
      if (r.status === "completed") {
        completed++;
        if (r.completedAt && r.completedAt >= startOfToday && r.completedAt <= endOfToday) {
          completedToday++;
        }
        continue;
      }
      if (r.status === "rejected") continue;

      if (r.status === "in_progress") inProgress++;
      else open++;

      if (r.priority === "urgent") urgentOpen++;

      const passed =
        (() => {
          if (r.dueDate) {
            const end = new Date(r.dueDate);
            end.setHours(23, 59, 59, 999);
            if (now > end.getTime()) return true;
          }
          if (r.status === "pending" || r.status === "problem") {
            return now > scheduledStartMs(r.taskDate, r.startTime);
          }
          return false;
        })();
      if (passed) overdueCount++;
    }

    return NextResponse.json({
      ok: true,
      data,
      stats: {
        open,
        in_progress: inProgress,
        completed,
        urgent_open: urgentOpen,
        overdue: overdueCount,
        completed_today: completedToday,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
