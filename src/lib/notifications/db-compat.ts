import { prismaAny } from "@/lib/prisma";

let priorityColumnReady: boolean | null = null;

/** בודק פעם אחת אם עמודת priority קיימת במסד (לפני שהמיגרציה רצה). */
export async function notificationPriorityColumnExists(): Promise<boolean> {
  if (priorityColumnReady !== null) return priorityColumnReady;
  try {
    await prismaAny.$queryRaw`SELECT "priority" FROM "Notification" LIMIT 0`;
    priorityColumnReady = true;
  } catch {
    priorityColumnReady = false;
  }
  return priorityColumnReady;
}

export function resetNotificationSchemaCache(): void {
  priorityColumnReady = null;
}

export function priorityFromMetadata(metadata: unknown): string {
  const m = metadata as Record<string, unknown> | null;
  const p = m?.priority;
  if (typeof p === "string" && p) return p;
  return "MEDIUM";
}
