import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export const dynamic = "force-dynamic";

/** GET /api/admin/email-logs — יומן מיילים למנהל */
export async function GET(req: NextRequest) {
  const dbErr = await requireDb();
  if (dbErr) return dbErr;

  const session = await getSessionFromCookie();
  if (!session || !isManagerRole(session.role)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const status = req.nextUrl.searchParams.get("status")?.trim();
  const type = req.nextUrl.searchParams.get("type")?.trim();

  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (type && type !== "all") where.type = type;

  const rows = (await prismaAny.emailLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      recipient: true,
      subject: true,
      type: true,
      status: true,
      error: true,
      sentAt: true,
      notificationId: true,
      userId: true,
      createdAt: true,
      user: { select: { fullName: true } },
    },
  })) as Array<{
    id: string;
    recipient: string;
    subject: string;
    type: string;
    status: string;
    error: string | null;
    sentAt: Date | null;
    notificationId: string | null;
    userId: string | null;
    createdAt: Date;
    user: { fullName: string } | null;
  }>;

  const filtered = q
    ? rows.filter(
        (r) =>
          r.recipient.toLowerCase().includes(q) ||
          r.subject.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          (r.user?.fullName ?? "").toLowerCase().includes(q),
      )
    : rows;

  return NextResponse.json({
    ok: true,
    data: filtered.map((r) => ({
      id: r.id,
      recipient: r.recipient,
      recipientName: r.user?.fullName ?? null,
      subject: r.subject,
      type: r.type,
      status: r.status,
      error: r.error,
      sentAt: r.sentAt?.toISOString() ?? null,
      notificationId: r.notificationId,
      userId: r.userId,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
