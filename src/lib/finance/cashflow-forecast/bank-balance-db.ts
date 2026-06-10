import { prisma } from "@/lib/prisma";

function isMissingForecastColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("forecastBankBalance") &&
    (msg.includes("does not exist") || msg.includes("Unknown column"))
  );
}

/** קריאה בטוחה — מחזירה 0 אם השורה/העמודה חסרים */
export async function getForecastBankBalance(): Promise<number> {
  try {
    const row = await prisma.financeSettings.findUnique({ where: { id: 1 } });
    if (!row) return 0;
    const val = row.forecastBankBalance;
    return typeof val === "number" && Number.isFinite(val) ? val : 0;
  } catch (e) {
    if (!isMissingForecastColumnError(e)) {
      console.error("[getForecastBankBalance]", e);
    }
    return 0;
  }
}

export async function setForecastBankBalance(amount: number): Promise<number> {
  try {
    const row = await prisma.financeSettings.upsert({
      where: { id: 1 },
      create: { id: 1, forecastBankBalance: amount },
      update: { forecastBankBalance: amount },
    });
    return row.forecastBankBalance;
  } catch (e) {
    if (isMissingForecastColumnError(e)) {
      throw new Error("MIGRATION_REQUIRED");
    }
    throw e;
  }
}
