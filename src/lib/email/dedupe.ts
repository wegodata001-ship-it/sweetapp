import { prismaAny } from "@/lib/prisma";

/** מונע שליחת מייל כפול לאותו נמען + סוג + ישות */
export async function hasRecentEmailLog(params: {
  userId?: string;
  recipient: string;
  type: string;
  notificationId?: string;
  entityKey?: string;
  entityValue?: string;
  sinceHours?: number;
}): Promise<boolean> {
  const since = new Date(Date.now() - (params.sinceHours ?? 24) * 60 * 60 * 1000);
  const where: Record<string, unknown> = {
    type: params.type,
    status: "sent",
    createdAt: { gte: since },
    recipient: params.recipient.toLowerCase(),
  };
  if (params.userId) where.userId = params.userId;
  if (params.notificationId) where.notificationId = params.notificationId;

  const rows = (await prismaAny.emailLog.findMany({
    where,
    take: 15,
    select: { id: true, metadata: true, notificationId: true },
  })) as { id: string; metadata: unknown; notificationId: string | null }[];

  if (params.notificationId) {
    return rows.some((r) => r.notificationId === params.notificationId);
  }

  if (!params.entityKey || params.entityValue == null) return rows.length > 0;

  return rows.some((r) => {
    const m = r.metadata as Record<string, unknown> | null;
    return m && String(m[params.entityKey!]) === String(params.entityValue);
  });
}
