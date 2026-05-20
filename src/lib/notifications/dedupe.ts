import { prismaAny } from "@/lib/prisma";

/** מונע כפילויות — אותו סוג + נושא + נמען בחלון זמן */
export async function hasRecentNotification(params: {
  type: string;
  recipientUserId?: string;
  subjectUserId?: string | null;
  roleTarget?: "ADMIN" | "EMPLOYEE";
  metadataKey?: string;
  metadataValue?: string;
  sinceHours?: number;
}): Promise<boolean> {
  const since = new Date(Date.now() - (params.sinceHours ?? 24) * 60 * 60 * 1000);
  const where: Record<string, unknown> = {
    type: params.type,
    createdAt: { gte: since },
  };
  if (params.recipientUserId) where.recipientUserId = params.recipientUserId;
  if (params.subjectUserId) where.subjectUserId = params.subjectUserId;
  if (params.roleTarget) where.roleTarget = params.roleTarget;

  const rows = (await prismaAny.notification.findMany({
    where,
    take: 20,
    select: { id: true, metadata: true },
  })) as { id: string; metadata: unknown }[];

  if (!params.metadataKey) return rows.length > 0;

  return rows.some((r) => {
    const m = r.metadata as Record<string, unknown> | null;
    return m && String(m[params.metadataKey!]) === String(params.metadataValue);
  });
}
