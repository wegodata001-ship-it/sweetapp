/**
 * READ-ONLY forensic: locate supplier هاني كعك and compare master vs ledger overview logic.
 * Forbidden: create/update/delete.
 * Never prints DATABASE_URL / credentials.
 *
 * Usage: npx vercel env run -e production -- node scripts/audit-hani-supplier-ledger.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function hasDb() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL || "";
  return Boolean(url && url.length > 20 && !/SENSITIVE/i.test(url));
}

function safeHost() {
  try {
    const u = new URL(process.env.DATABASE_URL || process.env.DIRECT_URL || "");
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "(unparsed)";
  }
}

async function main() {
  if (!hasDb()) {
    console.log(JSON.stringify({ ok: false, error: "NO_DATABASE_URL" }));
    process.exit(1);
  }

  const needles = ["هاني كعك", "هاني", "كعك", "האני", "Hani"];
  const report = {
    ok: true,
    dbHost: safeHost(),
    supplierMasterTotal: 0,
    customerTotal: 0,
    employeeTotal: 0,
    exact: null,
    containsHani: [],
    containsKaak: [],
    procurementSameAsMaster: true,
    ledgerOverviewSim: null,
    ledgerEntriesForHits: [],
    expenseDocsWithName: [],
    notes: [],
  };

  report.supplierMasterTotal = await prisma.supplier.count();
  report.customerTotal = await prisma.customer.count();
  report.employeeTotal = await prisma.employee.count();

  const exact = await prisma.supplier.findMany({
    where: { name: "هاني كعك" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      openingBalance: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { ledgerEntries: true, expenseDocuments: true, supplierProducts: true } },
    },
  });
  report.exact = exact;

  for (const q of ["هاني", "كعك"]) {
    const rows = await prisma.supplier.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        openingBalance: true,
        createdAt: true,
        _count: { select: { ledgerEntries: true, expenseDocuments: true } },
      },
      take: 50,
    });
    if (q === "هاني") report.containsHani = rows;
    if (q === "كعك") report.containsKaak = rows;
  }

  // Simulate ledger overview search q=هاني (same as API)
  const qRaw = "هاني";
  const nameWhere = { name: { contains: qRaw, mode: "insensitive" } };
  const [customers, suppliers, employees, customerCount, supplierCount, employeeCount] =
    await Promise.all([
      prisma.customer.findMany({
        where: nameWhere,
        orderBy: { name: "asc" },
        take: 24,
        select: { id: true, name: true },
      }),
      prisma.supplier.findMany({
        where: nameWhere,
        orderBy: { name: "asc" },
        take: 24,
        select: { id: true, name: true, openingBalance: true },
      }),
      prisma.employee.findMany({
        where: nameWhere,
        orderBy: { name: "asc" },
        take: 24,
        select: { id: true, name: true },
      }),
      prisma.customer.count({ where: nameWhere }),
      prisma.supplier.count({ where: nameWhere }),
      prisma.employee.count({ where: nameWhere }),
    ]);

  report.ledgerOverviewSim = {
    q: qRaw,
    counts: { customers: customerCount, suppliers: supplierCount, employees: employeeCount },
    supplierRows: suppliers,
    customerRows: customers,
    employeeRows: employees,
  };

  // Unfiltered overview counts (no q)
  report.ledgerOverviewNoFilter = {
    counts: {
      customers: await prisma.customer.count(),
      suppliers: await prisma.supplier.count(),
      employees: await prisma.employee.count(),
    },
  };

  const hitIds = [
    ...new Set([
      ...exact.map((r) => r.id),
      ...report.containsHani.map((r) => r.id),
    ]),
  ];

  if (hitIds.length > 0) {
    report.ledgerEntriesForHits = await prisma.ledgerEntry.findMany({
      where: { supplierId: { in: hitIds } },
      select: {
        id: true,
        supplierId: true,
        debit: true,
        credit: true,
        entryDate: true,
        docType: true,
        description: true,
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
  }

  // Free-text expense docs that mention the name but may lack supplierId
  report.expenseDocsWithName = await prisma.financialDocument.findMany({
    where: {
      category: { not: "הכנסה" },
      OR: [
        { title: { contains: "هاني", mode: "insensitive" } },
        { notes: { contains: "هاني", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      title: true,
      supplierId: true,
      totalAmount: true,
      createdAt: true,
    },
    take: 30,
    orderBy: { createdAt: "desc" },
  });

  // Also search metadata JSON via raw if possible — skip if risky
  // Check Product.supplier text field if exists - Product has supplierId relation only

  // Unicode / invisible char probe on exact matches
  report.nameCodePoints = exact.map((r) => ({
    id: r.id,
    name: r.name,
    length: r.name.length,
    codePoints: [...r.name].map((ch) => ch.codePointAt(0)?.toString(16)),
  }));

  // Compare expected search string codepoints
  report.searchCodePoints = {
    هاني: [..."هاني"].map((ch) => ch.codePointAt(0)?.toString(16)),
    "هاني كعك": [..."هاني كعك"].map((ch) => ch.codePointAt(0)?.toString(16)),
  };

  // Sample of all suppliers containing Arabic letters near ك or ه
  report.sampleArabicSuppliers = await prisma.supplier.findMany({
    where: {
      OR: [
        { name: { contains: "ه", mode: "insensitive" } },
        { name: { contains: "ك", mode: "insensitive" } },
        { name: { contains: "ع", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true },
    take: 40,
    orderBy: { name: "asc" },
  });

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
