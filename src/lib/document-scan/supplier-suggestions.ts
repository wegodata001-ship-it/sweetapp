import { prisma } from "@/lib/prisma";
import { stringSimilarity } from "./similarity";
import {
  supplierMatchLabels,
  supplierNamesMatch,
} from "./supplier-aliases";

function containsFuzzy(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/** Rank suppliers for "did you mean" UI after AI scan. */
export async function rankSupplierSuggestions(scannedName: string, limit = 8) {
  const clean = scannedName.trim();
  if (!clean) return [];
  const suppliers = await prisma.supplier.findMany({
    select: { id: true, name: true, phone: true, notes: true },
    orderBy: { name: "asc" },
  });
  const ranked: { id: string; name: string; phone: string | null; score: number }[] = [];
  for (const s of suppliers) {
    let score = stringSimilarity(clean, s.name);
    for (const label of supplierMatchLabels(s.name, s.notes)) {
      if (supplierNamesMatch(label, clean)) score = Math.max(score, 0.92);
      score = Math.max(score, stringSimilarity(clean, label));
      if (containsFuzzy(label, clean)) score = Math.max(score, 0.8);
    }
    if (score >= 0.38) ranked.push({ id: s.id, name: s.name, phone: s.phone, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
