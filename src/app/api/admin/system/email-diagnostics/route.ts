import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { getEmailDiagnostics } from "@/lib/email/diagnostics";
import { prismaAny } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session || (session.role !== "SUPER_ADMIN" && !isManagerRole(session.role))) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const diagnostics = getEmailDiagnostics();

  const [recentLogs, failedNotifications, pendingNotifications] = await Promise.all([
    prismaAny.emailLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 86_400_000) } },
    }),
    prismaAny.notification.count({ where: { emailStatus: "failed" } }),
    prismaAny.notification.count({
      where: { emailStatus: { in: ["pending", "queued"] } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    diagnostics,
    stats: {
      emailLogsLast24h: recentLogs,
      failedNotifications,
      pendingNotifications,
    },
  });
}
