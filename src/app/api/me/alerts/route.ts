import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { listMeNotifications, markMeNotificationsRead, isManagerRole } from "@/lib/notifications/me-inbox";

/** תאימות לאחור — ממפה ל־Notification; מעדיף לקוחות חדשים: ‎/api/me/notifications */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const onlyUnread = req.nextUrl.searchParams.get("unread") === "1";
  const { rows, unreadCount } = await listMeNotifications({
    userId: session.sub,
    role: session.role,
    onlyUnread,
    take: isManagerRole(session.role) ? 80 : 40,
  });

  return NextResponse.json({
    ok: true,
    data: {
      unreadCount,
      items: rows.map((a) => ({
        id: a.id,
        kind: a.type,
        title: a.title,
        body: a.message,
        readAt: a.isRead ? a.createdAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
      })),
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
