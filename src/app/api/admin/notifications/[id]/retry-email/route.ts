import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { prismaAny } from "@/lib/prisma";
import { processNotificationEmail } from "@/lib/email/notification-email-pipeline";
import type { NotificationEmailPayload } from "@/lib/email/notification-bridge";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: RouteCtx) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session || (session.role !== "SUPER_ADMIN" && !isManagerRole(session.role))) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const row = (await prismaAny.notification.findUnique({
    where: { id },
    select: {
      id: true,
      recipientUserId: true,
      type: true,
      title: true,
      message: true,
      actionUrl: true,
      metadata: true,
      roleTarget: true,
      priority: true,
      emailStatus: true,
    },
  })) as {
    id: string;
    recipientUserId: string;
    type: string;
    title: string;
    message: string;
    actionUrl: string | null;
    metadata: unknown;
    roleTarget: string;
    priority: string;
    emailStatus: string | null;
  } | null;

  if (!row) {
    return NextResponse.json({ ok: false, error: "התראה לא נמצאה" }, { status: 404 });
  }

  const payload: NotificationEmailPayload = {
    notificationId: row.id,
    recipientUserId: row.recipientUserId,
    type: row.type,
    title: row.title,
    message: row.message,
    actionUrl: row.actionUrl,
    metadata: row.metadata,
    roleTarget: row.roleTarget as NotificationEmailPayload["roleTarget"],
  };

  await processNotificationEmail(payload, row.priority, {
    forceImmediate: true,
    skipDedupe: true,
    isRetry: true,
  });

  const updated = (await prismaAny.notification.findUnique({
    where: { id },
    select: { emailStatus: true, emailSkippedReason: true, emailSentAt: true },
  })) as { emailStatus: string | null; emailSkippedReason: string | null; emailSentAt: Date | null } | null;

  return NextResponse.json({
    ok: updated?.emailStatus === "sent",
    emailStatus: updated?.emailStatus,
    emailSkippedReason: updated?.emailSkippedReason,
    emailSentAt: updated?.emailSentAt,
  });
}
