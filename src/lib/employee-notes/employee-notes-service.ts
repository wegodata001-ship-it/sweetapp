import type { EmployeeNote, EmployeeNotePriority } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import { documentEmailBusinessId } from "@/lib/finance/document-email-business";
import { createNotification } from "@/lib/notifications/create";
import { prisma } from "@/lib/prisma";

export type SerializedEmployeeNote = {
  id: string;
  title: string;
  content: string | null;
  priority: EmployeeNotePriority;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
};

export type EmployeeNoteInput = {
  title: string;
  content?: string | null;
  priority?: EmployeeNotePriority;
};

const VALID_PRIORITIES = new Set<EmployeeNotePriority>(["NORMAL", "HIGH", "URGENT"]);

export function serializeEmployeeNote(
  row: EmployeeNote & { user?: { fullName: string } | null },
): SerializedEmployeeNote {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    priority: row.priority,
    isCompleted: row.isCompleted,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByName: row.user?.fullName ?? "",
  };
}

function noteSelect() {
  return {
    id: true,
    businessId: true,
    userId: true,
    title: true,
    content: true,
    priority: true,
    isCompleted: true,
    completedAt: true,
    createdAt: true,
    updatedAt: true,
    user: { select: { fullName: true } },
  } as const;
}

function parsePriority(raw: unknown): EmployeeNotePriority {
  const v = String(raw ?? "NORMAL").toUpperCase();
  if (VALID_PRIORITIES.has(v as EmployeeNotePriority)) return v as EmployeeNotePriority;
  return "NORMAL";
}

function priorityLabel(priority: EmployeeNotePriority): string {
  switch (priority) {
    case "URGENT":
      return "דחופה";
    case "HIGH":
      return "גבוהה";
    default:
      return "רגילה";
  }
}

async function notificationRoleTarget(userId: string): Promise<"ADMIN" | "EMPLOYEE"> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return u?.role === "ADMIN" || u?.role === "SUPER_ADMIN" ? "ADMIN" : "EMPLOYEE";
}

async function syncOpenNoteNotification(
  userId: string,
  note: EmployeeNote & { user?: { fullName: string } | null },
): Promise<void> {
  const actionUrl = `/my-notes?id=${encodeURIComponent(note.id)}`;
  const preview = note.content?.trim() ? note.content.trim().slice(0, 120) : note.title;
  const message = `${preview} · עדיפות: ${priorityLabel(note.priority)}`;

  if (note.isCompleted) {
    await prismaAny.notification.updateMany({
      where: {
        recipientUserId: userId,
        type: "PERSONAL_NOTE",
        actionUrl,
      },
      data: { isRead: true },
    });
    return;
  }

  await createNotification({
    recipientUserId: userId,
    roleTarget: await notificationRoleTarget(userId),
    subjectUserId: userId,
    type: "PERSONAL_NOTE",
    title: `📌 ${note.title}`,
    message,
    priority: note.priority === "URGENT" ? "HIGH" : note.priority === "HIGH" ? "MEDIUM" : "LOW",
    actionUrl,
    metadata: { noteId: note.id },
    dedupe: { metadataKey: "noteId", sinceHours: 24 * 365 },
  });
}

export async function listEmployeeNotes(params: {
  userId: string;
  status?: "open" | "completed" | "all";
  limit?: number;
}): Promise<SerializedEmployeeNote[]> {
  const { userId, status = "open", limit = 200 } = params;
  const businessId = documentEmailBusinessId();

  const where: {
    userId: string;
    businessId: string;
    isCompleted?: boolean;
  } = { userId, businessId };

  if (status === "open") where.isCompleted = false;
  else if (status === "completed") where.isCompleted = true;

  const rows = await prismaAny.employeeNote.findMany({
    where,
    orderBy: [{ isCompleted: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: noteSelect(),
  });

  return rows.map(serializeEmployeeNote);
}

export async function countOpenEmployeeNotes(userId: string): Promise<number> {
  return prismaAny.employeeNote.count({
    where: {
      userId,
      businessId: documentEmailBusinessId(),
      isCompleted: false,
    },
  });
}

export async function getEmployeeNoteForUser(
  userId: string,
  noteId: string,
): Promise<SerializedEmployeeNote | null> {
  const row = await prismaAny.employeeNote.findFirst({
    where: {
      id: noteId,
      userId,
      businessId: documentEmailBusinessId(),
    },
    select: noteSelect(),
  });
  return row ? serializeEmployeeNote(row) : null;
}

export async function createEmployeeNote(
  userId: string,
  input: EmployeeNoteInput,
): Promise<SerializedEmployeeNote> {
  const title = input.title.trim();
  if (!title) throw new Error("חסרה כותרת");

  const row = await prismaAny.employeeNote.create({
    data: {
      businessId: documentEmailBusinessId(),
      userId,
      title,
      content: input.content?.trim() || null,
      priority: parsePriority(input.priority),
    },
    select: noteSelect(),
  });

  await syncOpenNoteNotification(userId, row);
  return serializeEmployeeNote(row);
}

export async function updateEmployeeNote(
  userId: string,
  noteId: string,
  input: Partial<EmployeeNoteInput>,
): Promise<SerializedEmployeeNote> {
  const existing = await prismaAny.employeeNote.findFirst({
    where: { id: noteId, userId, businessId: documentEmailBusinessId() },
    select: { id: true },
  });
  if (!existing) throw new Error("הודעה לא נמצאה");

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error("חסרה כותרת");
    data.title = title;
  }
  if (input.content !== undefined) data.content = input.content?.trim() || null;
  if (input.priority !== undefined) data.priority = parsePriority(input.priority);

  const row = await prismaAny.employeeNote.update({
    where: { id: noteId },
    data,
    select: noteSelect(),
  });

  if (!row.isCompleted) await syncOpenNoteNotification(userId, row);
  return serializeEmployeeNote(row);
}

export async function completeEmployeeNote(
  userId: string,
  noteId: string,
): Promise<SerializedEmployeeNote> {
  const existing = await prismaAny.employeeNote.findFirst({
    where: { id: noteId, userId, businessId: documentEmailBusinessId() },
    select: { id: true },
  });
  if (!existing) throw new Error("הודעה לא נמצאה");

  const row = await prismaAny.employeeNote.update({
    where: { id: noteId },
    data: {
      isCompleted: true,
      completedAt: new Date(),
    },
    select: noteSelect(),
  });

  await syncOpenNoteNotification(userId, row);
  return serializeEmployeeNote(row);
}

export async function deleteEmployeeNote(userId: string, noteId: string): Promise<void> {
  const existing = await prismaAny.employeeNote.findFirst({
    where: { id: noteId, userId, businessId: documentEmailBusinessId() },
    select: { id: true },
  });
  if (!existing) throw new Error("הודעה לא נמצאה");

  await prismaAny.employeeNote.delete({ where: { id: noteId } });
  await prismaAny.notification.updateMany({
    where: {
      recipientUserId: userId,
      type: "PERSONAL_NOTE",
      actionUrl: `/my-notes?id=${encodeURIComponent(noteId)}`,
    },
    data: { isRead: true },
  });
}
