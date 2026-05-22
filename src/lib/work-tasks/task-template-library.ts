/**
 * ספריית TaskTemplate — כל משימה חדשה נשמרת במאגר לשימוש חוזר.
 */

import { prisma } from "@/lib/prisma";

function normTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

/** מחפש תבנית קיימת (case-insensitive) או יוצר חדשה */
export async function findOrCreateTaskTemplate(params: {
  title: string;
  description?: string | null;
  estimatedMinutes?: number;
}): Promise<{ id: string; created: boolean }> {
  const title = normTitle(params.title);
  if (!title) throw new Error("חובה שם משימה");

  const existing = await prisma.taskTemplate.findFirst({
    where: {
      isActive: true,
      title: { equals: title, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const minutes =
    typeof params.estimatedMinutes === "number" && params.estimatedMinutes > 0
      ? Math.round(params.estimatedMinutes)
      : 15;

  const max = await prisma.taskTemplate.aggregate({ _max: { orderIndex: true } });
  const row = await prisma.taskTemplate.create({
    data: {
      title,
      description: params.description?.trim() || null,
      estimatedMinutes: minutes,
      orderIndex: (max._max.orderIndex ?? -1) + 1,
    },
  });
  return { id: row.id, created: true };
}

/** חיפוש חכם ל-autocomplete */
export async function searchTaskTemplates(query: string, limit = 12) {
  const q = normTitle(query);
  if (!q || q.length < 1) {
    return prisma.taskTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        estimatedMinutes: true,
      },
    });
  }
  return prisma.taskTemplate.findMany({
    where: {
      isActive: true,
      title: { contains: q, mode: "insensitive" },
    },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      description: true,
      estimatedMinutes: true,
    },
  });
}
