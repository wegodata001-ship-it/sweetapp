import { PrismaClient } from "@prisma/client";
import { normalizeDatabaseUrl } from "@/lib/prisma-db-health";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function activeDatabaseUrl(): string | undefined {
  const useDirect =
    process.env.DATABASE_USE_DIRECT === "1" ||
    process.env.DATABASE_USE_DIRECT === "true";
  const raw = (
    useDirect ? process.env.DIRECT_URL : process.env.DATABASE_URL
  )?.trim();
  return raw ? normalizeDatabaseUrl(raw) : undefined;
}

function buildPrismaClient(): PrismaClient {
  const url = activeDatabaseUrl();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

export const prisma = globalForPrisma.prisma ?? buildPrismaClient();

/** גישה למודלים חדשים לפני `prisma generate` מוצלח (למשל EPERM ב־Windows) */
export const prismaAny = prisma as any;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function prismaReady(): Promise<boolean> {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** בדיקת חיבור מהירה — לפני טעינת דשבורד */
export async function pingDatabase(): Promise<boolean> {
  if (!(await prismaReady())) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
