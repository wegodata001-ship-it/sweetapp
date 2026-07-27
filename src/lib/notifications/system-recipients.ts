/**
 * נמעני התראות מערכת — קריאה/כתיבה לרשימת הכתובות הקבועות.
 *
 * הרשימה נשמרת ב־DB בלבד. אין כתובת קשיחה בקוד: ברירת המחדל נזרעת ב־migration,
 * וניתן להוסיף כתובות התחלתיות בסביבה חדשה דרך SYSTEM_ALERT_RECIPIENTS.
 */
import { prismaAny } from "@/lib/prisma";
import { isDeliverableEmail, normalizeEmail } from "@/lib/email/config";
import {
  recipientWantsCategory,
  sanitizeCategories,
  type SystemAlertCategory,
} from "@/lib/notifications/alert-categories";

export type SystemRecipientRow = {
  id: string;
  email: string;
  label: string;
  isActive: boolean;
  allCategories: boolean;
  categories: string[];
  notes: string | null;
  lastSentAt: string | null;
  createdAt: string;
};

type DbRow = {
  id: string;
  email: string;
  label: string;
  isActive: boolean;
  allCategories: boolean;
  categories: string[] | null;
  notes: string | null;
  lastSentAt: Date | null;
  createdAt: Date;
};

function serialize(row: DbRow): SystemRecipientRow {
  return {
    id: row.id,
    email: row.email,
    label: row.label,
    isActive: row.isActive,
    allCategories: row.allCategories,
    categories: row.categories ?? [],
    notes: row.notes,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  email: true,
  label: true,
  isActive: true,
  allCategories: true,
  categories: true,
  notes: true,
  lastSentAt: true,
  createdAt: true,
} as const;

/** כל הנמענים — למסך ההגדרות */
export async function listSystemRecipients(): Promise<SystemRecipientRow[]> {
  const rows = (await prismaAny.systemNotificationRecipient.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: SELECT,
  })) as DbRow[];
  return rows.map(serialize);
}

export type ResolvedRecipient = { id: string; email: string; label: string };

/**
 * הנמענים שאמורים לקבל קטגוריה מסוימת.
 * הסינון נעשה בקוד (ולא ב־SQL על מערך) כדי שהלוגיקה תהיה במקום אחד ובדיקה אחת.
 */
export async function resolveRecipientsForCategory(
  category: SystemAlertCategory,
): Promise<ResolvedRecipient[]> {
  let rows: DbRow[];
  try {
    rows = (await prismaAny.systemNotificationRecipient.findMany({
      where: { isActive: true },
      select: SELECT,
    })) as DbRow[];
  } catch {
    // רשימת נמענים לא זמינה לא אמורה להפיל את הזרימה שקראה לה
    return [];
  }

  const out: ResolvedRecipient[] = [];
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!isDeliverableEmail(email)) continue;
    if (
      !recipientWantsCategory(
        {
          isActive: row.isActive,
          allCategories: row.allCategories,
          categories: row.categories ?? [],
        },
        category,
      )
    ) {
      continue;
    }
    out.push({ id: row.id, email, label: row.label });
  }
  return out;
}

/** עדכון best-effort של "נשלח לאחרונה" — לא חוסם ולא זורק */
export async function markRecipientSent(id: string): Promise<void> {
  try {
    await prismaAny.systemNotificationRecipient.update({
      where: { id },
      data: { lastSentAt: new Date() },
    });
  } catch {
    // תצוגה בלבד
  }
}

export type CreateRecipientInput = {
  email: string;
  label?: string | null;
  notes?: string | null;
  isActive?: boolean;
  allCategories?: boolean;
  categories?: unknown;
  createdById?: string | null;
};

export type RecipientMutationResult =
  | { ok: true; row: SystemRecipientRow }
  | { ok: false; error: string };

export async function createSystemRecipient(
  input: CreateRecipientInput,
): Promise<RecipientMutationResult> {
  const email = normalizeEmail(input.email ?? "");
  if (!isDeliverableEmail(email)) {
    return { ok: false, error: "כתובת מייל לא תקינה" };
  }

  const allCategories = input.allCategories !== false;
  const categories = allCategories ? [] : sanitizeCategories(input.categories);
  if (!allCategories && categories.length === 0) {
    return { ok: false, error: "בחרו לפחות סוג התראה אחד" };
  }

  const exists = await prismaAny.systemNotificationRecipient.findUnique({
    where: { email },
    select: { id: true },
  });
  if (exists) return { ok: false, error: "הכתובת כבר קיימת ברשימה" };

  const row = (await prismaAny.systemNotificationRecipient.create({
    data: {
      email,
      label: input.label?.trim() || "",
      notes: input.notes?.trim() || null,
      isActive: input.isActive !== false,
      allCategories,
      categories,
      createdById: input.createdById ?? null,
    },
    select: SELECT,
  })) as DbRow;

  return { ok: true, row: serialize(row) };
}

export type UpdateRecipientInput = {
  label?: string | null;
  notes?: string | null;
  isActive?: boolean;
  allCategories?: boolean;
  categories?: unknown;
};

export async function updateSystemRecipient(
  id: string,
  input: UpdateRecipientInput,
): Promise<RecipientMutationResult> {
  const current = (await prismaAny.systemNotificationRecipient.findUnique({
    where: { id },
    select: SELECT,
  })) as DbRow | null;
  if (!current) return { ok: false, error: "הנמען לא נמצא" };

  const data: Record<string, unknown> = {};
  if (input.label !== undefined) data.label = input.label?.trim() || "";
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (typeof input.isActive === "boolean") data.isActive = input.isActive;

  if (input.allCategories !== undefined || input.categories !== undefined) {
    const allCategories =
      input.allCategories !== undefined ? input.allCategories : current.allCategories;
    const categories = allCategories
      ? []
      : sanitizeCategories(
          input.categories !== undefined ? input.categories : (current.categories ?? []),
        );
    if (!allCategories && categories.length === 0) {
      return { ok: false, error: "בחרו לפחות סוג התראה אחד" };
    }
    data.allCategories = allCategories;
    data.categories = categories;
  }

  if (Object.keys(data).length === 0) {
    return { ok: true, row: serialize(current) };
  }

  const row = (await prismaAny.systemNotificationRecipient.update({
    where: { id },
    data,
    select: SELECT,
  })) as DbRow;
  return { ok: true, row: serialize(row) };
}

export async function deleteSystemRecipient(
  id: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const current = (await prismaAny.systemNotificationRecipient.findUnique({
    where: { id },
    select: { id: true, email: true },
  })) as { id: string; email: string } | null;
  if (!current) return { ok: false, error: "הנמען לא נמצא" };
  await prismaAny.systemNotificationRecipient.delete({ where: { id } });
  return { ok: true, email: current.email };
}

/**
 * זריעת כתובות התחלתיות בסביבה חדשה מתוך SYSTEM_ALERT_RECIPIENTS
 * (רשימה מופרדת בפסיקים). לא דורס שינויים שנעשו במסך ההגדרות.
 */
export async function ensureRecipientsFromEnv(): Promise<number> {
  const raw = process.env.SYSTEM_ALERT_RECIPIENTS?.trim();
  if (!raw) return 0;
  let added = 0;
  for (const part of raw.split(/[,;\s]+/)) {
    const email = normalizeEmail(part);
    if (!isDeliverableEmail(email)) continue;
    try {
      const exists = await prismaAny.systemNotificationRecipient.findUnique({
        where: { email },
        select: { id: true },
      });
      if (exists) continue;
      await prismaAny.systemNotificationRecipient.create({
        data: { email, label: "", isActive: true, allCategories: true, categories: [] },
      });
      added++;
    } catch {
      // כתובת בודדת שנכשלה לא עוצרת את השאר
    }
  }
  return added;
}
