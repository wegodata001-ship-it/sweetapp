import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export const dynamic = "force-dynamic";

/** GET — דף QA זמני: 80 התראות אחרונות */
export async function GET() {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const rows = await prismaAny.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      priority: true,
      recipientUserId: true,
      subjectUserId: true,
      roleTarget: true,
      isRead: true,
      actionUrl: true,
      createdAt: true,
      recipient: { select: { id: true, fullName: true, role: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    data: rows.map((r: {
      id: string;
      type: string;
      title: string;
      message: string;
      priority?: string;
      recipientUserId: string;
      subjectUserId: string | null;
      roleTarget: string;
      isRead: boolean;
      actionUrl: string | null;
      createdAt: Date;
      recipient: { id: string; fullName: string | null; role: string };
    }) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      priority: r.priority ?? "MEDIUM",
      recipientUserId: r.recipientUserId,
      recipientName: r.recipient.fullName,
      recipientRole: r.recipient.role,
      subjectUserId: r.subjectUserId,
      roleTarget: r.roleTarget,
      isRead: r.isRead,
      actionUrl: r.actionUrl,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
