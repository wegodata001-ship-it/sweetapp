import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { createAdminBroadcast, createEmployeeNotification } from "@/lib/notifications/create";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { logNotificationCreated } from "@/lib/notifications/audit";

export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  message?: string;
  summary?: string;
  type?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  target?: "ADMIN" | "EMPLOYEE" | "ALL_EMPLOYEES";
  userId?: string;
  actionUrl?: string;
  metadata?: unknown;
};

/**
 * POST /api/notifications/create
 * מנהל — פרסום עדכון / התראת מערכת.
 */
export async function POST(req: NextRequest) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session || !isManagerRole(session.role)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const body = (await req.json()) as Body;
  const title = String(body.title ?? "").trim();
  const message = String(body.message ?? body.summary ?? "").trim();
  if (!title || !message) {
    return NextResponse.json({ ok: false, error: "חובה כותרת והודעה" }, { status: 400 });
  }

  const type = String(body.type ?? "NEW_UPDATE").trim();
  const priority = body.priority ?? "MEDIUM";
  const target = body.target ?? "ALL_EMPLOYEES";

  try {
    if (target === "EMPLOYEE" && body.userId) {
      await createEmployeeNotification(body.userId, {
        type,
        title: type === "NEW_UPDATE" ? "פורסם עדכון חדש" : title,
        message: type === "NEW_UPDATE" ? `${title}\n${message}` : message,
        priority,
        actionUrl: body.actionUrl ?? "/me/dashboard?update=1",
        metadata: {
          ...(body.metadata as object),
          importantUpdate: type === "NEW_UPDATE",
          source: "admin_create",
          publisherId: session.sub,
        },
      });
      return NextResponse.json({ ok: true, data: { sent: 1 } });
    }

    if (target === "ADMIN") {
      const admins = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
        select: { id: true },
      });
      await createAdminBroadcast(
        admins.map((a) => a.id),
        {
          type,
          title,
          message,
          priority,
          actionUrl: body.actionUrl ?? null,
          metadata: { ...(body.metadata as object), source: "admin_create" },
        },
      );
      return NextResponse.json({ ok: true, data: { sent: admins.length } });
    }

    const employees = await prisma.user.findMany({
      where: { isActive: true, role: "EMPLOYEE" },
      select: { id: true },
    });
    const broadcastId = `update:${title}:${message}`.slice(0, 200);
    let sent = 0;
    for (const u of employees) {
      const dup = await hasRecentNotification({
        type: "NEW_UPDATE",
        recipientUserId: u.id,
        roleTarget: "EMPLOYEE",
        metadataKey: "broadcastId",
        metadataValue: broadcastId,
        sinceHours: 2,
      });
      if (dup) continue;
      await createEmployeeNotification(u.id, {
        type: "NEW_UPDATE",
        title: "פורסם עדכון חדש",
        message: `${title}\n${message}`,
        priority,
        actionUrl: body.actionUrl ?? "/me/dashboard?update=1",
        metadata: {
          ...(body.metadata as object),
          broadcastId,
          importantUpdate: true,
          source: "admin_broadcast",
          publisherId: session.sub,
        },
      });
      sent += 1;
    }
    logNotificationCreated({ type: "NEW_UPDATE", broadcastId, sent, total: employees.length });
    return NextResponse.json({ ok: true, data: { sent } });
  } catch (e) {
    console.error("[POST /api/notifications/create]", e);
    return NextResponse.json({ ok: false, error: "יצירה נכשלה" }, { status: 500 });
  }
}
