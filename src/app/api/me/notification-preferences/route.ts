import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import { getUserEmailPreferences, type EmailMode } from "@/lib/email/preferences";
import { requireDb } from "@/lib/api-route";

export const dynamic = "force-dynamic";

const MODES: EmailMode[] = ["important", "critical_only", "daily_digest", "muted"];

export async function GET() {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const prefs = await getUserEmailPreferences(session.sub);
  return NextResponse.json({ ok: true, data: prefs });
}

export async function PATCH(req: NextRequest) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const body = (await req.json()) as Partial<{
    emailMode: EmailMode;
    emailQuietHours: boolean;
    emailNotifyAll: boolean;
    emailNotifyTasks: boolean;
    emailNotifyLate: boolean;
    emailNotifyUpdates: boolean;
  }>;

  const data: Record<string, boolean | string> = {};
  if (body.emailMode && MODES.includes(body.emailMode)) {
    data.emailMode = body.emailMode;
    if (body.emailMode === "muted") data.emailNotifyAll = false;
    if (body.emailMode === "important") data.emailNotifyAll = true;
  }
  if (typeof body.emailQuietHours === "boolean") data.emailQuietHours = body.emailQuietHours;
  if (typeof body.emailNotifyAll === "boolean") data.emailNotifyAll = body.emailNotifyAll;
  if (typeof body.emailNotifyTasks === "boolean") data.emailNotifyTasks = body.emailNotifyTasks;
  if (typeof body.emailNotifyLate === "boolean") data.emailNotifyLate = body.emailNotifyLate;
  if (typeof body.emailNotifyUpdates === "boolean") data.emailNotifyUpdates = body.emailNotifyUpdates;

  try {
    const updated = await prisma.user.update({
      where: { id: session.sub },
      data,
      select: {
        emailMode: true,
        emailQuietHours: true,
        emailNotifyAll: true,
        emailNotifyTasks: true,
        emailNotifyLate: true,
        emailNotifyUpdates: true,
      },
    });
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    console.error("[PATCH /api/me/notification-preferences]", e);
    return NextResponse.json({ ok: false, error: "עדכון נכשל" }, { status: 500 });
  }
}
