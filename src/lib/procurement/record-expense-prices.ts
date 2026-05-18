import type { IncomeExpensePayload } from "@/lib/finance/document-payload";
import { parseNum } from "@/lib/format-shekel";
import { prisma } from "@/lib/prisma";
import { stringSimilarity } from "@/lib/ocr/similarity";

/** שומר / מעדכן מחירון ספק מהוצאה (OCR-ready). */
export async function recordSupplierPriceHistoryFromExpense(ie: IncomeExpensePayload): Promise<void> {
  if (ie.kind !== "expense" || !ie.supplierId?.trim()) return;
  const supplierId = ie.supplierId.trim();

  for (const line of ie.lines) {
    const unit = parseNum(line.price);
    if (unit <= 0) continue;

    const itemName = line.itemName?.trim();
    if (!itemName) continue;

    let catalogId = line.supplierProductId?.trim() || null;

    if (!catalogId) {
      const rows = await prisma.supplierProduct.findMany({
        where: { supplierId },
        select: { id: true, productName: true },
      });
      let best: { id: string; score: number } | null = null;
      for (const row of rows) {
        const score = stringSimilarity(row.productName, itemName);
        if (score >= 0.55 && (best === null || score > best.score)) {
          best = { id: row.id, score };
        }
      }
      catalogId = best?.id ?? null;
    }

    let prod = catalogId
      ? await prisma.supplierProduct.findFirst({
          where: { id: catalogId, supplierId },
          select: { id: true, regularPrice: true },
        })
      : null;

    if (!prod) {
      const created = await prisma.supplierProduct.create({
        data: {
          supplierId,
          productName: itemName,
          regularPrice: unit,
        },
        select: { id: true, regularPrice: true },
      });
      prod = created;
    } else {
      const history = await prisma.supplierProductPriceHistory.findMany({
        where: { supplierProductId: prod.id, source: "expense" },
        select: { price: true },
        orderBy: { recordedAt: "desc" },
        take: 24,
      });
      const prices = [unit, ...history.map((h) => h.price)].filter((p) => p > 0);
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      await prisma.supplierProduct.update({
        where: { id: prod.id },
        data: { regularPrice: Math.round(avg * 100) / 100, productName: itemName },
      });
    }

    await prisma.supplierProductPriceHistory.create({
      data: {
        supplierProductId: prod.id,
        price: unit,
        source: "expense",
      },
    });
  }
}
