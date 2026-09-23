/**
 * Read-only Prisma export. Pagination by primary key. No writes.
 */
import type { ClientModelDef } from "./catalog";
import { CLIENT_MODELS } from "./catalog";
import { serializeRows } from "./serialize";

export const DEFAULT_PAGE_SIZE = 500;

export type PrismaDelegate = {
  count: (args?: unknown) => Promise<number>;
  findMany: (args: {
    take: number;
    skip?: number;
    cursor?: Record<string, unknown>;
    orderBy: Record<string, "asc">;
  }) => Promise<Record<string, unknown>[]>;
};

export type PrismaLike = Record<string, PrismaDelegate | undefined>;

export type ExportedModel = {
  def: ClientModelDef;
  sourceCount: number;
  rows: Record<string, unknown>[];
};

export async function paginateFindMany(
  delegate: PrismaDelegate,
  idField: string,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: unknown;
  for (;;) {
    const batch = await delegate.findMany({
      take: pageSize,
      ...(cursor !== undefined ? { skip: 1, cursor: { [idField]: cursor } } : {}),
      orderBy: { [idField]: "asc" },
    });
    rows.push(...batch);
    if (batch.length < pageSize) break;
    cursor = batch[batch.length - 1]?.[idField];
    if (cursor === undefined || cursor === null) break;
  }
  return rows;
}

export async function exportClientModels(
  prisma: PrismaLike,
  opts?: { pageSize?: number; models?: ClientModelDef[] },
): Promise<ExportedModel[]> {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  const defs = opts?.models ?? CLIENT_MODELS;
  const out: ExportedModel[] = [];

  for (const def of defs) {
    const delegate = prisma[def.prisma];
    if (!delegate?.count || !delegate.findMany) {
      throw new Error(`Prisma delegate missing for ${def.model}`);
    }
    const sourceCount = await delegate.count();
    const raw = await paginateFindMany(delegate, def.idField, pageSize);
    const rows = serializeRows(raw, {
      amountFields: def.amountFields,
      excludeFields: def.excludeFields,
    });
    out.push({ def, sourceCount, rows });
  }

  return out;
}
