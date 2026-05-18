import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  listMeNotifications,
  markMeNotificationsRead,
  sectionForNotificationType,
  isManagerRole,
} from "@/lib/notifications/me-inbox";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const onlyUnread = req.nextUrl.searchParams.get("unread") === "1";
  const { rows, unreadCount, inbox } = await listMeNotifications({
    userId: session.sub,
    role: session.role,
    onlyUnread,
    take: isManagerRole(session.role) ? 80 : 40,
  });

  const items = rows.map((a) => ({
    id: a.id,
    type: a.type,
    section: sectionForNotificationType(a.type),
    title: a.title,
    message: a.message,
    body: a.message,
    color: a.color,
    isRead: a.isRead,
    readAt: a.isRead ? a.createdAt.toISOString() : null,
    actionUrl: a.actionUrl,
    createdAt: a.createdAt.toISOString(),
  }));

  return NextResponse.json({
    ok: true,
    data: {
      inbox,
      unreadCount,
      items,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const body = (await req.json()) as { ids?: string[]; markAllRead?: boolean };
  const result = await markMeNotificationsRead({
    userId: session.sub,
    role: session.role,
    ids: body.ids,
    markAllRead: body.markAllRead,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
