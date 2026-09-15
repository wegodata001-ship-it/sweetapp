/**
 * READ-ONLY forensic audit of inventory counts (Production).
 * Allowed: findMany / findFirst / count / $queryRaw SELECT
 * Forbidden: create/update/delete/executeRaw writes
 *
 * Usage:
 *   npx vercel env run -e production -- node scripts/inventory-count-forensic-audit.mjs
 *
 * Never prints DATABASE_URL or credentials.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const FIX_SHA = "26d621fd5341e47f252a5fcce6cf4aa3c16c3bb8";
const FIX_DEPLOYED_AT = new Date("2026-08-26T14:40:32.558Z");
const RANGE_START = new Date("2026-08-25T21:00:00.000Z"); // 26/08/2026 00:00 Asia/Jerusalem
const RANGE_END = new Date();

/** Load .env.local into process.env without printing values (never overwrites existing). */
function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] != null && process.env[key] !== "") continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function assertReadOnlyEnv() {
  loadDotEnvLocal();
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL || "";
  if (!url || /SENSITIVE/i.test(url) || url.length < 20) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "DB_URL_UNAVAILABLE",
        hint: "Add Production DATABASE_URL (and DIRECT_URL if needed) to .env.local and save the file.",
      }),
    );
    process.exit(2);
  }
  if (!/^postgres/i.test(url)) {
    console.error(JSON.stringify({ ok: false, error: "UNEXPECTED_DB_PROVIDER" }));
    process.exit(2);
  }
  console.log(
    JSON.stringify({
      DB_configured: true,
      Provider: "PostgreSQL",
      Environment: "Production",
      FixSha: FIX_SHA,
      FixDeployedAt: FIX_DEPLOYED_AT.toISOString(),
      RangeStartUtc: RANGE_START.toISOString(),
      RangeEndUtc: RANGE_END.toISOString(),
    }),
  );
}

function jerusalemDay(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function jerusalemStamp(d) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function workerLabel(w) {
  const area = (w.workerWorkArea || "").trim();
  const name = (w.workerDisplayName || "").trim();
  return area || name || w.inventoryLocationWorkerId.slice(0, 8);
}

function classifyOldPrefill(prevWorkers, nextWorkers, prevTotal, nextTotal) {
  if (!prevWorkers?.length || !nextWorkers?.length) return false;
  if (!(prevTotal > 0 && nextTotal > 0 && nextTotal < prevTotal)) return false;
  // One site kept prior qty; another became 0; total dropped by that amount
  const prevByKey = new Map();
  for (const w of prevWorkers) {
    prevByKey.set(workerLabel(w).toLowerCase(), Number(w.countedQuantity));
  }
  let kept = 0;
  let zeroed = 0;
  let zeroedAmount = 0;
  for (const w of nextWorkers) {
    const key = workerLabel(w).toLowerCase();
    const prev = prevByKey.get(key);
    const cur = Number(w.countedQuantity);
    if (prev == null) continue;
    if (Math.abs(cur - prev) < 1e-9 && cur > 0) kept += 1;
    if (cur === 0 && prev > 0) {
      zeroed += 1;
      zeroedAmount += prev;
    }
  }
  if (kept >= 1 && zeroed >= 1 && Math.abs(prevTotal - nextTotal - zeroedAmount) < 1e-6) {
    return true;
  }
  return false;
}

async function main() {
  assertReadOnlyEnv();
  const prisma = new PrismaClient({
    datasources: {
      db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
    },
    log: ["error"],
  });

  try {
    // connectivity smoke (SELECT 1)
    await prisma.$queryRaw`SELECT 1 AS ok`;

    const locations = await prisma.inventoryLocation.findMany({
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    });

    const rami =
      locations.find((l) => /ראמי\s*גודי/i.test(l.name) && /עוג/i.test(l.name)) ||
      locations.find((l) => /ראמי/i.test(l.name) && /גודי/i.test(l.name));

    const counts = await prisma.inventoryCount.findMany({
      where: {
        createdAt: { gte: RANGE_START, lte: RANGE_END },
        OR: [{ sessionId: null }, { session: { status: { not: "VOID" } } }],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        inventoryProductId: true,
        locationId: true,
        previousQuantity: true,
        currentQuantity: true,
        minimumQuantity: true,
        countDate: true,
        createdAt: true,
        countedByUserId: true,
        sessionId: true,
        inventoryProduct: {
          select: { id: true, name: true, nameHe: true },
        },
        location: { select: { id: true, name: true } },
        countedBy: { select: { id: true, fullName: true, email: true } },
        session: {
          select: {
            id: true,
            sessionNumber: true,
            status: true,
            locationName: true,
            countedByUserId: true,
            productCount: true,
          },
        },
        workerLines: {
          select: {
            inventoryLocationWorkerId: true,
            countedQuantity: true,
            workerDisplayName: true,
            workerWorkArea: true,
          },
        },
      },
    });

    const byKey = new Map();
    for (const c of counts) {
      const key = `${c.locationId || "null"}::${c.inventoryProductId}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(c);
    }

    // Also load one prior active count before range per product+location for chain/positive→0
    const keys = [...byKey.keys()];
    const priorByKey = new Map();
    for (const key of keys) {
      const [locId, productId] = key.split("::");
      const prior = await prisma.inventoryCount.findFirst({
        where: {
          inventoryProductId: productId,
          locationId: locId === "null" ? null : locId,
          createdAt: { lt: RANGE_START },
          OR: [{ sessionId: null }, { session: { status: { not: "VOID" } } }],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          currentQuantity: true,
          createdAt: true,
          workerLines: {
            select: {
              inventoryLocationWorkerId: true,
              countedQuantity: true,
              workerDisplayName: true,
              workerWorkArea: true,
            },
          },
        },
      });
      if (prior) priorByKey.set(key, prior);
    }

    const positiveToZero = [];
    const drops50 = [];
    const workerSumMismatch = [];
    const brokenPreviousChain = [];
    const concurrent = [];
    const oldPrefillLike = [];
    const sessionAgg = new Map();

    for (const c of counts) {
      const workerSum = c.workerLines.reduce((s, w) => s + Number(w.countedQuantity || 0), 0);
      if (c.workerLines.length > 0 && Math.abs(workerSum - Number(c.currentQuantity)) > 1e-6) {
        workerSumMismatch.push({
          countId: c.id,
          product: c.inventoryProduct.nameHe || c.inventoryProduct.name,
          location: c.location?.name || c.session?.locationName || "",
          currentQuantity: c.currentQuantity,
          workerSum,
          createdAt: c.createdAt.toISOString(),
        });
      }

      if (c.sessionId) {
        if (!sessionAgg.has(c.sessionId)) {
          sessionAgg.set(c.sessionId, {
            sessionId: c.sessionId,
            sessionNumber: c.session?.sessionNumber ?? null,
            location: c.location?.name || c.session?.locationName || "",
            user: c.countedBy?.fullName || c.countedByUserId || "—",
            products: 0,
            zeros: 0,
            positiveToZero: 0,
            drops50: 0,
            status: c.session?.status || "?",
          });
        }
        const s = sessionAgg.get(c.sessionId);
        s.products += 1;
        if (Number(c.currentQuantity) === 0) s.zeros += 1;
      }
    }

    for (const [key, list] of byKey) {
      const prior = priorByKey.get(key) || null;
      const sequence = prior ? [prior, ...list] : list;

      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        const prev = i === 0 ? prior : list[i - 1];
        const productName = cur.inventoryProduct.nameHe || cur.inventoryProduct.name;
        const locationName = cur.location?.name || cur.session?.locationName || "";
        const userName = cur.countedBy?.fullName || cur.countedByUserId || "—";

        if (prev) {
          // previous chain: prev.current should ≈ cur.previous
          if (Math.abs(Number(prev.currentQuantity) - Number(cur.previousQuantity)) > 1e-6) {
            brokenPreviousChain.push({
              product: productName,
              location: locationName,
              prevCountId: prev.id,
              prevCurrent: prev.currentQuantity,
              nextCountId: cur.id,
              nextPrevious: cur.previousQuantity,
              nextCurrent: cur.currentQuantity,
              createdAt: cur.createdAt.toISOString(),
              afterFix: cur.createdAt >= FIX_DEPLOYED_AT,
            });
          }

          const before = Number(prev.currentQuantity);
          const after = Number(cur.currentQuantity);
          if (before > 0 && after === 0) {
            const event = {
              kind: "POSITIVE_TO_ZERO",
              product: productName,
              location: locationName,
              before,
              after,
              createdAt: cur.createdAt.toISOString(),
              jerusalem: jerusalemStamp(cur.createdAt),
              user: userName,
              sessionId: cur.sessionId,
              sessionNumber: cur.session?.sessionNumber ?? null,
              countId: cur.id,
              afterFix: cur.createdAt >= FIX_DEPLOYED_AT,
              prevWorkers: (prev.workerLines || []).map((w) => ({
                label: workerLabel(w),
                qty: w.countedQuantity,
              })),
              nextWorkers: cur.workerLines.map((w) => ({
                label: workerLabel(w),
                qty: w.countedQuantity,
              })),
            };
            positiveToZero.push(event);
            if (cur.sessionId && sessionAgg.has(cur.sessionId)) {
              sessionAgg.get(cur.sessionId).positiveToZero += 1;
            }
            if (
              classifyOldPrefill(
                prev.workerLines || [],
                cur.workerLines,
                before,
                after === 0 ? before : after, // for zero total special-case below
              )
            ) {
              // zero total with one kept / one zeroed won't match classify which wants nextTotal>0
            }
            // Also check pattern when next total is 0 with all workers 0 after partial keep? skip
            if (cur.sessionId && sessionAgg.has(cur.sessionId) === false) {
              /* noop */
            }
          }

          if (before > 0 && after < before * 0.5) {
            drops50.push({
              product: productName,
              location: locationName,
              before,
              after,
              createdAt: cur.createdAt.toISOString(),
              jerusalem: jerusalemStamp(cur.createdAt),
              user: userName,
              sessionId: cur.sessionId,
              sessionNumber: cur.session?.sessionNumber ?? null,
              countId: cur.id,
              afterFix: cur.createdAt >= FIX_DEPLOYED_AT,
              prevWorkers: (prev.workerLines || []).map((w) => ({
                label: workerLabel(w),
                qty: w.countedQuantity,
              })),
              nextWorkers: cur.workerLines.map((w) => ({
                label: workerLabel(w),
                qty: w.countedQuantity,
              })),
              likelyOldPrefill: classifyOldPrefill(
                prev.workerLines || [],
                cur.workerLines,
                before,
                after,
              ),
            });
            if (cur.sessionId && sessionAgg.has(cur.sessionId)) {
              sessionAgg.get(cur.sessionId).drops50 += 1;
            }
          }

          if (
            classifyOldPrefill(
              prev.workerLines || [],
              cur.workerLines,
              before,
              after,
            )
          ) {
            oldPrefillLike.push({
              product: productName,
              location: locationName,
              before,
              after,
              createdAt: cur.createdAt.toISOString(),
              jerusalem: jerusalemStamp(cur.createdAt),
              user: userName,
              countId: cur.id,
              afterFix: cur.createdAt >= FIX_DEPLOYED_AT,
              prevWorkers: (prev.workerLines || []).map((w) => ({
                label: workerLabel(w),
                qty: w.countedQuantity,
              })),
              nextWorkers: cur.workerLines.map((w) => ({
                label: workerLabel(w),
                qty: w.countedQuantity,
              })),
            });
          }
        }
      }

      // concurrent within 2 minutes
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        const ms = b.createdAt.getTime() - a.createdAt.getTime();
        if (ms >= 0 && ms <= 2 * 60 * 1000) {
          concurrent.push({
            product: b.inventoryProduct.nameHe || b.inventoryProduct.name,
            location: b.location?.name || "",
            msApart: ms,
            a: {
              at: a.createdAt.toISOString(),
              qty: a.currentQuantity,
              user: a.countedBy?.fullName || a.countedByUserId,
              countId: a.id,
            },
            b: {
              at: b.createdAt.toISOString(),
              qty: b.currentQuantity,
              user: b.countedBy?.fullName || b.countedByUserId,
              countId: b.id,
            },
            afterFix: b.createdAt >= FIX_DEPLOYED_AT,
          });
        }
      }
    }

    // Rami daily matrix
    const days = [];
    for (let i = 0; i < 8; i++) {
      const d = new Date(Date.UTC(2026, 7, 26 + i, 12, 0, 0));
      days.push(jerusalemDay(d));
    }

    const ramiCounts = rami
      ? counts.filter((c) => c.locationId === rami.id)
      : [];
    const ramiProducts = new Map();
    for (const c of ramiCounts) {
      const name = c.inventoryProduct.nameHe || c.inventoryProduct.name;
      if (!ramiProducts.has(name)) ramiProducts.set(name, new Map());
      const day = jerusalemDay(c.createdAt);
      const cell = ramiProducts.get(name);
      // last count of that day
      const prev = cell.get(day);
      if (!prev || new Date(prev.createdAt) < c.createdAt) {
        cell.set(day, {
          qty: c.currentQuantity,
          createdAt: c.createdAt.toISOString(),
          countId: c.id,
        });
      }
    }

    const ramiAnomalyIds = new Set([
      ...positiveToZero.filter((e) => rami && e.location === rami.name).map((e) => e.countId),
      ...drops50.filter((e) => rami && e.location === rami.name).map((e) => e.countId),
      ...oldPrefillLike.filter((e) => rami && e.location === rami.name).map((e) => e.countId),
    ]);

    const ramiTable = [...ramiProducts.entries()]
      .map(([product, dayMap]) => {
        const row = { product };
        for (const day of days) {
          const cell = dayMap.get(day);
          if (!cell) row[day] = "—";
          else {
            const warn = ramiAnomalyIds.has(cell.countId) ? " ⚠" : "";
            row[day] = `${cell.qty}${warn}`;
          }
        }
        return row;
      })
      .sort((a, b) => a.product.localeCompare(b.product, "he"));

    const suspiciousSessions = [...sessionAgg.values()]
      .filter((s) => s.positiveToZero >= 3 || s.drops50 >= 5 || (s.zeros >= 8 && s.products >= 10))
      .sort((a, b) => b.positiveToZero - a.positiveToZero || b.drops50 - a.drops50);

    const report = {
      production: {
        FIX_LIVE: true,
        SHA: FIX_SHA,
        DEPLOYED_AT: FIX_DEPLOYED_AT.toISOString(),
        DEPLOYED_AT_JERUSALEM: jerusalemStamp(FIX_DEPLOYED_AT),
        domain: "halawiyatquds.com",
        project: "sweetapp",
        branch: "main",
      },
      data: {
        countsChecked: counts.length,
        productsChecked: new Set(counts.map((c) => c.inventoryProductId)).size,
        locationsChecked: new Set(counts.map((c) => c.locationId).filter(Boolean)).size,
        locationsTotal: locations.length,
        ramiLocation: rami ? { id: rami.id, name: rami.name, isActive: rami.isActive } : null,
        POSITIVE_TO_ZERO: positiveToZero.length,
        DROPS_GT_50: drops50.length,
        WORKER_SUM_MISMATCHES: workerSumMismatch.length,
        BROKEN_PREVIOUS_CHAIN: brokenPreviousChain.length,
        CONCURRENT_SAVES: concurrent.length,
        OLD_PREFILL_LIKE: oldPrefillLike.length,
        OLD_PREFILL_BEFORE_FIX: oldPrefillLike.filter((e) => !e.afterFix).length,
        OLD_PREFILL_AFTER_FIX: oldPrefillLike.filter((e) => e.afterFix).length,
        POSITIVE_TO_ZERO_BEFORE_FIX: positiveToZero.filter((e) => !e.afterFix).length,
        POSITIVE_TO_ZERO_AFTER_FIX: positiveToZero.filter((e) => e.afterFix).length,
        DROPS_AFTER_FIX: drops50.filter((e) => e.afterFix).length,
        suspiciousSessions: suspiciousSessions.length,
      },
      positiveToZero,
      drops50: drops50.slice(0, 200),
      workerSumMismatch,
      brokenPreviousChain: brokenPreviousChain.slice(0, 100),
      concurrent: concurrent.slice(0, 100),
      oldPrefillLike,
      sessions: [...sessionAgg.values()].sort(
        (a, b) => b.positiveToZero - a.positiveToZero || b.drops50 - a.drops50,
      ),
      suspiciousSessions,
      ramiDailyTable: ramiTable,
      ramiSuspiciousEvents: [
        ...positiveToZero.filter((e) => rami && e.location === rami.name),
        ...oldPrefillLike.filter((e) => rami && e.location === rami.name),
      ],
    };

    const outPath = path.join(
      process.env.TEMP || process.env.TMP || ".",
      "sweetapp-inventory-forensic-report.json",
    );
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify({ reportPath: outPath, summary: report.data, production: report.production }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  process.exit(1);
});
