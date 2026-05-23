import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  listMeNotifications,
  markMeNotificationsRead,
  sectionForNotificationType,
} from "@/lib/notifications/me-inbox";
import { resolveNotificationColor } from "@/lib/notifications/priority";

const LIST_HEADERS = { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" };

function toIsoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

const getCachedInbox = unstable_cache(
  async (userId: string, role: string) => {
    const listed = await listMeNotifications({
      userId,
      role: role as "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE",
      onlyUnread: false,
      take: 10,
    });
    return {
      rows: listed.rows,
      unreadCount: listed.unreadCount,
      inbox: listed.inbox,
    };
  },
  ["me-notifications-inbox"],
  { revalidate: 30 },
);

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const onlyUnread = req.nextUrl.searchParams.get("unread") === "1";
  let rows: Awaited<ReturnType<typeof listMeNotifications>>["rows"] = [];
  let unreadCount = 0;
  let inbox: "employee" | "admin" = "employee";
  try {
    const listed = onlyUnread
      ? await listMeNotifications({
          userId: session.sub,
          role: session.role,
          onlyUnread: true,
          take: 10,
        })
      : await getCachedInbox(session.sub, session.role);
    rows = listed.rows;
    unreadCount = listed.unreadCount;
    inbox = listed.inbox;
  } catch {
    return NextResponse.json(
      {
        ok: true,
        data: { inbox: "employee", unreadCount: 0, items: [] },
      },
      { headers: LIST_HEADERS },
    );
  }

  const items = rows.map((a) => ({
    id: a.id,
    type: a.type,
    section: sectionForNotificationType(a.type),
    title: a.title,
    message: a.message,
    body: a.message,
    priority: a.priority,
    color: resolveNotificationColor(a.priority, a.color),
    isRead: a.isRead,
    readAt: a.isRead ? toIsoDate(a.createdAt) : null,
    actionUrl: a.actionUrl,
    createdAt: toIsoDate(a.createdAt),
  }));

  return NextResponse.json(
    {
      ok: true,
      data: {
        inbox,
        unreadCount,
        items,
      },
    },
    { headers: LIST_HEADERS },
  );
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
