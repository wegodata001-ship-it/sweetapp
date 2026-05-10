import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type EmployeeTaskOrm = {
  findMany: (args: unknown) => Promise<unknown[]>;
  findUnique: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  createMany: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  count: (args: unknown) => Promise<number>;
  groupBy: (args: unknown) => Promise<{ employeeId: string; _count: { _all: number } }[]>;
};

/** delegate למודל EmployeeTask — קיים בלקוח אחרי `npx prisma generate` + `db push` */
export function getEmployeeTaskOrm(): EmployeeTaskOrm {
  const t = (prisma as unknown as Record<string, unknown>).employeeTask;
  if (!t)
    throw new Error("מודל EmployeeTask חסר בלקוח Prisma — הריצו npx prisma generate ו-prisma db push");
  return t as EmployeeTaskOrm;
}

export async function prismaReady(): Promise<boolean> {
  return Boolean(process.env.DATABASE_URL?.trim());
}
