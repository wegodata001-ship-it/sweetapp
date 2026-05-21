import { Prisma } from "@prisma/client";

/** שגיאות חיבור ל-Supabase / Postgres (לא זמין, timeout, רשת) */
export function isDbConnectionError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientInitializationError) return true;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return e.code === "P1001" || e.code === "P1002" || e.code === "P1017";
  }
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("Can't reach database server") ||
    msg.includes("Connection timed out") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("Connection pool")
  );
}

/** פרמטרים מומלצים ל-Supabase pooler (פורט 6543) */
export function normalizeDatabaseUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.port === "6543" || u.hostname.includes("pooler")) {
      if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
      if (!u.searchParams.has("connection_limit")) {
        u.searchParams.set("connection_limit", "10");
      }
    }
    if (!u.searchParams.has("connect_timeout")) {
      u.searchParams.set("connect_timeout", "15");
    }
    return u.toString();
  } catch {
    return url;
  }
}
