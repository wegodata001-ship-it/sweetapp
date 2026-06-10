import { prisma } from "@/lib/prisma";
import { parseDateKey } from "@/lib/finance/cashflow-forecast/date-utils";

export type ManualForecastEntryType = "expected_income" | "loan";

export type ManualForecastEntry = {
  id: string;
  entryType: ManualForecastEntryType;
  amount: number;
  dueDate: string;
  description: string;
};

function parseEntries(raw: unknown): ManualForecastEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ManualForecastEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const entryType = r.entryType === "loan" ? "loan" : r.entryType === "expected_income" ? "expected_income" : null;
    const amount = Number(r.amount);
    const dueDate = typeof r.dueDate === "string" ? parseDateKey(r.dueDate) : null;
    const description = typeof r.description === "string" ? r.description.trim() : "";
    if (!id || !entryType || !dueDate || !(amount > 0)) continue;
    out.push({ id, entryType, amount, dueDate, description: description || (entryType === "loan" ? "הלוואה" : "הכנסה צפויה") });
  }
  return out;
}

export async function listManualForecastEntries(): Promise<ManualForecastEntry[]> {
  try {
    const row = await prisma.financeSettings.findUnique({
      where: { id: 1 },
      select: { forecastManualEntries: true },
    });
    return parseEntries(row?.forecastManualEntries);
  } catch {
    return [];
  }
}

async function saveManualForecastEntries(entries: ManualForecastEntry[]): Promise<void> {
  await prisma.financeSettings.upsert({
    where: { id: 1 },
    create: { id: 1, forecastManualEntries: entries as object[] },
    update: { forecastManualEntries: entries as object[] },
  });
}

export async function addManualForecastEntry(input: {
  entryType: ManualForecastEntryType;
  amount: number;
  dueDate: string;
  description?: string;
}): Promise<ManualForecastEntry> {
  const dueDate = parseDateKey(input.dueDate);
  if (!dueDate) throw new Error("תאריך לא תקין");
  if (!(input.amount > 0)) throw new Error("סכום חייב להיות חיובי");

  const entry: ManualForecastEntry = {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    entryType: input.entryType,
    amount: input.amount,
    dueDate,
    description:
      input.description?.trim() ||
      (input.entryType === "loan" ? "הלוואה צפויה" : "הכנסה צפויה"),
  };

  const existing = await listManualForecastEntries();
  await saveManualForecastEntries([...existing, entry]);
  return entry;
}
