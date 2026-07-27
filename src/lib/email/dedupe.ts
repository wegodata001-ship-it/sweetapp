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

/**
 * ייחודיות לפי מפתח מפורש (metadata.dedupeKey).
 *
 * נדרש כשאותו אירוע נוצר כמה פעמים — למשל התראה שנרשמת בנפרד לכל מנהל, ולכן
 * notificationId שונה בכל פעם, אבל לנמען החיצוני מדובר באירוע אחד.
 * הבדיקה היא לפי נמען, כך שנמענים שונים לא חוסמים זה את זה.
 */
export async function hasRecentEmailLogByKey(params: {
  recipient: string;
  dedupeKey: string;
  sinceHours?: number;
}): Promise<boolean> {
  const since = new Date(Date.now() - (params.sinceHours ?? 12) * 60 * 60 * 1000);
  const rows = (await prismaAny.emailLog.findMany({
    where: {
      status: "sent",
      recipient: params.recipient.toLowerCase(),
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { metadata: true },
  })) as { metadata: unknown }[];

  return rows.some((r) => {
    const m = r.metadata as Record<string, unknown> | null;
    return m != null && m.dedupeKey === params.dedupeKey;
  });
}
