import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { markMeNotificationsRead } from "@/lib/notifications/me-inbox";

export const dynamic = "force-dynamic";

/** PATCH /api/notifications/read */
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
