import type { PrismaClient } from "@prisma/client";
import type { EntityType } from "@/lib/finance/types";

export const RECENT_LEDGER_LIMIT = 8;

export type LedgerEntityRef = {
  entityType: EntityType;
  entityId: string;
  entityName: string;
};

export type RecentLedgerEntity = LedgerEntityRef & {
  lastActivityAt: string;
};

type ActivityHit = LedgerEntityRef & {
  lastActivityAt: Date | string;
};

const ENTITY_TYPES = new Set<EntityType>(["customer", "supplier", "employee"]);

function asEntityType(value: string): EntityType | null {
  return ENTITY_TYPES.has(value as EntityType) ? (value as EntityType) : null;
}

/** One row per entity, newest ledger movement first. Does not merge different ids. */
export function selectRecentLedgerActivity(rows: ActivityHit[], limit = RECENT_LEDGER_LIMIT): RecentLedgerEntity[] {
  const byEntity = new Map<string, RecentLedgerEntity & { at: number }>();
  for (const row of rows) {
    const entityType = asEntityType(row.entityType);
    const entityId = row.entityId?.trim();
    const entityName = row.entityName?.trim();
    if (!entityType || !entityId || !entityName) continue;
    const at = new Date(row.lastActivityAt).getTime();
    if (!Number.isFinite(at)) continue;
    const key = `${entityType}:${entityId}`;
    const prev = byEntity.get(key);
    if (prev && prev.at >= at) continue;
    byEntity.set(key, {
      entityType,
      entityId,
      entityName,
      lastActivityAt: new Date(at).toISOString(),
      at,
    });
  }
  return [...byEntity.values()]
    .sort((a, b) => b.at - a.at || a.entityName.localeCompare(b.entityName, "he"))
    .slice(0, Math.max(0, limit))
    .map(({ at: _at, ...row }) => row);
}

/** Round-robin so one type does not hide the others in a short suggestion list. */
export function mixLedgerSuggestions(groups: LedgerEntityRef[][], limit = RECENT_LEDGER_LIMIT): LedgerEntityRef[] {
  const lists = groups.map((group) => [...group]);
  const out: LedgerEntityRef[] = [];
  const seen = new Set<string>();
  while (out.length < limit && lists.some((list) => list.length > 0)) {
    for (const list of lists) {
      const next = list.shift();
      if (!next) continue;
      const key = `${next.entityType}:${next.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(next);
      if (out.length >= limit) break;
    }
  }
  return out;
}

type RecentSqlRow = {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  last_activity_at: Date;
};

/**
 * One grouped query. Activity time is the movement itself
 * (document, payment, ledger entry, or manual receipt), not the entity createdAt.
 */
export async function loadRecentLedgerActivity(db: PrismaClient): Promise<RecentLedgerEntity[]> {
  const rows = await db.$queryRaw<RecentSqlRow[]>`
    WITH hits AS (
      SELECT 'customer' AS entity_type,
             d."customerId" AS entity_id,
             GREATEST(COALESCE(d."docDate"::timestamptz, d."createdAt"), d."createdAt") AS activity_at
      FROM "FinancialDocument" d
      WHERE d."customerId" IS NOT NULL
      UNION ALL
      SELECT 'customer', p."customerId", p."createdAt"
      FROM "Payment" p
      UNION ALL
      SELECT 'supplier', l."supplierId",
             GREATEST(l."entryDate"::timestamptz, l."createdAt")
      FROM "LedgerEntry" l
      WHERE l."supplierId" IS NOT NULL
      UNION ALL
      SELECT 'employee', l."employeeId",
             GREATEST(l."entryDate"::timestamptz, l."createdAt")
      FROM "LedgerEntry" l
      WHERE l."employeeId" IS NOT NULL
      UNION ALL
      SELECT 'supplier', d."supplierId",
             GREATEST(COALESCE(d."docDate"::timestamptz, d."createdAt"), d."createdAt")
      FROM "FinancialDocument" d
      WHERE d."supplierId" IS NOT NULL
      UNION ALL
      SELECT 'employee', d."employeeId",
             GREATEST(COALESCE(d."docDate"::timestamptz, d."createdAt"), d."createdAt")
      FROM "FinancialDocument" d
      WHERE d."employeeId" IS NOT NULL
      UNION ALL
      SELECT 'supplier', s.id, m."createdAt"
      FROM "manual_receipts" m
      JOIN "Supplier" s
        ON regexp_replace(btrim(s.name), '\\s+', ' ', 'g')
         = regexp_replace(btrim(m."supplierName"), '\\s+', ' ', 'g')
    ),
    best AS (
      SELECT entity_type, entity_id, MAX(activity_at) AS last_activity_at
      FROM hits
      GROUP BY entity_type, entity_id
    )
    SELECT b.entity_type,
           b.entity_id,
           b.last_activity_at,
           CASE b.entity_type
             WHEN 'customer' THEN c.name
             WHEN 'supplier' THEN s.name
             ELSE e.name
           END AS entity_name
    FROM best b
    LEFT JOIN "Customer" c ON b.entity_type = 'customer' AND c.id = b.entity_id
    LEFT JOIN "Supplier" s ON b.entity_type = 'supplier' AND s.id = b.entity_id
    LEFT JOIN "Employee" e ON b.entity_type = 'employee' AND e.id = b.entity_id
    WHERE CASE b.entity_type
            WHEN 'customer' THEN c.id
            WHEN 'supplier' THEN s.id
            ELSE e.id
          END IS NOT NULL
    ORDER BY b.last_activity_at DESC
    LIMIT 8
  `;
  return selectRecentLedgerActivity(
    rows.map((row) => ({
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      entityName: row.entity_name,
      lastActivityAt: row.last_activity_at,
    })),
  );
}
