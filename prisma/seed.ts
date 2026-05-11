import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** פריטי ספירת מלאי קבועים — קטגוריה, מיקום, מינימום, כמות אחרונה לדוגמה */
const INVENTORY_SEED = [
  {
    name: "קמח לבן שק 25 ק״ג",
    location: "מדף א",
    category: "חומרי גלם",
    minimumQuantity: 200,
    demoQty: 180,
    demoPrev: 200,
  },
  {
    name: "סוכר דמררה",
    location: "מדף ב",
    category: "חומרי גלם",
    minimumQuantity: 50,
    demoQty: 90,
    demoPrev: 85,
  },
  {
    name: "שמנת מתוקה 38%",
    location: "מקרר מדף ג",
    category: "קירור",
    minimumQuantity: 12,
    demoQty: 12,
    demoPrev: 15,
  },
  {
    name: "מגשים ריקים",
    location: "מדף אריזות",
    category: "אריזות",
    minimumQuantity: 100,
    demoQty: 200,
    demoPrev: 195,
  },
  {
    name: "קופסאות קרטון למארזים",
    location: "מדף ד",
    category: "אריזות",
    minimumQuantity: 30,
    demoQty: 40,
    demoPrev: 38,
  },
  {
    name: "מדבקות לוגו",
    location: "מדף אטום",
    category: "מדבקות",
    minimumQuantity: 500,
    demoQty: 600,
    demoPrev: 580,
  },
] as const;

async function main() {
  const canonicalNames = [...INVENTORY_SEED.map((i) => i.name)];

  await prisma.inventoryProduct.deleteMany({
    where: { name: { notIn: canonicalNames } },
  });

  for (const item of INVENTORY_SEED) {
    await prisma.inventoryProduct.upsert({
      where: { name: item.name },
      create: {
        name: item.name,
        location: item.location,
        category: item.category,
        minimumQuantity: item.minimumQuantity,
      },
      update: {
        location: item.location,
        category: item.category,
        minimumQuantity: item.minimumQuantity,
      },
    });
  }

  const countAnchor = new Date();
  countAnchor.setHours(12, 0, 0, 0);

  for (const item of INVENTORY_SEED) {
    const p = await prisma.inventoryProduct.findUnique({ where: { name: item.name } });
    if (!p) continue;

    const existing = await prisma.inventoryCount.findFirst({
      where: { inventoryProductId: p.id },
      orderBy: { countDate: "desc" },
    });
    if (existing) continue;

    await prisma.inventoryCount.create({
      data: {
        inventoryProductId: p.id,
        countDate: countAnchor,
        previousQuantity: item.demoPrev,
        currentQuantity: item.demoQty,
        difference: item.demoQty - item.demoPrev,
        note: "נתוני דמו — ספירה לדוגמה",
      },
    });
  }

  console.log(
    `Upserted ${INVENTORY_SEED.length} inventory products; ensured one demo count per item when DB was empty.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
