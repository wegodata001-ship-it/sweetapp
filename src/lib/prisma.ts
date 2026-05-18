import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

/** גישה למודלים חדשים לפני `prisma generate` מוצלח (למשל EPERM ב־Windows) */
export const prismaAny = prisma as any;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function prismaReady(): Promise<boolean> {
  return Boolean(process.env.DATABASE_URL?.trim());
}
