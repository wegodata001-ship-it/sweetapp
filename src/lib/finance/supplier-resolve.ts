import type { Prisma } from "@prisma/client";
import { normalizeSupplierName } from "@/lib/document-scan/supplier-aliases";
import { normalizeExpenseType } from "@/lib/finance/expense-types";

export function isDatabaseSaveError(error: unknown): boolean {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  return name.startsWith("PrismaClient");
}

export class SupplierNameRequiredError extends Error {
  constructor() {
    super("שם ספק חובה");
    this.name = "SupplierNameRequiredError";
  }
}

/** Display name: trim and collapse spaces. Does not merge different names. */
export function supplierDisplayName(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function matchExistingSupplier<T extends { id: string; name: string }>(
  rows: T[],
  rawName: string,
): T | null {
  const key = normalizeSupplierName(supplierDisplayName(rawName));
  if (!key) return null;
  return rows.find((row) => normalizeSupplierName(row.name) === key) ?? null;
}

export async function findOrCreateSupplier(
  db: Prisma.TransactionClient,
  rawName: string,
  extras?: {
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    openingBalance?: number;
  },
): Promise<{ id: string; name: string } | null> {
  const name = supplierDisplayName(rawName);
  const key = normalizeSupplierName(name);
  if (!key) return null;

  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`supplier:${key}`})::bigint)`;
  const rows = await db.supplier.findMany({ select: { id: true, name: true } });
  const existing = matchExistingSupplier(rows, name);
  if (existing) return existing;

  return db.supplier.create({
    data: {
      name,
      phone: extras?.phone?.trim() || null,
      email: extras?.email?.trim() || null,
      notes: extras?.notes?.trim() || null,
      openingBalance: extras?.openingBalance ?? 0,
    },
    select: { id: true, name: true },
  });
}

/** Use the selected supplier, or the exact stored name, or create one. */
export async function resolveExpenseSupplier(
  db: Prisma.TransactionClient,
  input: { expenseType?: string | null; supplierId?: string | null; supplierName?: string | null },
): Promise<{ id: string; name: string } | null> {
  if (normalizeExpenseType(input.expenseType) !== "SUPPLIER_PAYMENTS") return null;
  const supplierId = input.supplierId?.trim();
  if (supplierId) {
    const selected = await db.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true },
    });
    if (selected) return selected;
  }
  const resolved = await findOrCreateSupplier(db, input.supplierName ?? "");
  if (!resolved) throw new SupplierNameRequiredError();
  return resolved;
}
