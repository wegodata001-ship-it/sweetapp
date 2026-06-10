import { prismaAny } from "@/lib/prisma";
import { isDeliverableEmail } from "@/lib/email/config";
import {
  documentEmailBusinessId,
  normalizeContactEmail,
} from "@/lib/finance/document-email-business";

export type DocumentEmailContactRow = {
  id: string;
  businessId: string;
  name: string | null;
  email: string;
  isFavorite: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

function toRow(c: {
  id: string;
  businessId: string;
  name: string | null;
  email: string;
  isFavorite: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}): DocumentEmailContactRow {
  return {
    id: c.id,
    businessId: c.businessId,
    name: c.name,
    email: c.email,
    isFavorite: c.isFavorite,
    lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export async function listDocumentEmailContacts(): Promise<DocumentEmailContactRow[]> {
  const businessId = documentEmailBusinessId();
  const rows = await prismaAny.documentEmailContact.findMany({
    where: { businessId },
    orderBy: [{ isFavorite: "desc" }, { lastUsedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toRow);
}

export async function upsertDocumentEmailContact(params: {
  email: string;
  name?: string | null;
  isFavorite?: boolean;
  touchLastUsed?: boolean;
}): Promise<DocumentEmailContactRow | null> {
  const email = normalizeContactEmail(params.email);
  if (!isDeliverableEmail(email)) return null;

  const businessId = documentEmailBusinessId();
  const now = new Date();
  const name = params.name?.trim() || null;

  const row = await prismaAny.documentEmailContact.upsert({
    where: { businessId_email: { businessId, email } },
    create: {
      businessId,
      email,
      name,
      isFavorite: params.isFavorite ?? false,
      lastUsedAt: params.touchLastUsed ? now : null,
    },
    update: {
      ...(name ? { name } : {}),
      ...(params.isFavorite != null ? { isFavorite: params.isFavorite } : {}),
      ...(params.touchLastUsed ? { lastUsedAt: now } : {}),
    },
  });

  return toRow(row);
}

export async function touchDocumentEmailContacts(emails: string[]): Promise<void> {
  const unique = [...new Set(emails.map(normalizeContactEmail).filter(Boolean))];
  await Promise.all(
    unique.map((email) =>
      upsertDocumentEmailContact({ email, touchLastUsed: true }),
    ),
  );
}

export async function setDocumentEmailContactFavorite(
  id: string,
  isFavorite: boolean,
): Promise<DocumentEmailContactRow | null> {
  const businessId = documentEmailBusinessId();
  try {
    const row = await prismaAny.documentEmailContact.update({
      where: { id, businessId },
      data: { isFavorite },
    });
    return toRow(row);
  } catch {
    return null;
  }
}
