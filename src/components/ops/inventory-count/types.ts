export type ShelfSummary = {
  name: string;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  okCount: number;
  matchPct: number;
};

export type InventoryCountProductRow = {
  id: string;
  name: string;
  location: string;
  unit: string | null;
  previousQuantity: number;
  lastCountedAt: string | null;
};

export type MonthlyCountRow = InventoryCountProductRow & {
  raw: string;
  actual: number | null;
  diff: number | null;
};

export type InventoryLocationPick = {
  id: string;
  name: string;
};

export type ListMeta = { total: number; page: number; pageSize: number };

export type ShelfStatusKind = "counted" | "pending" | "shortage" | "recent";

export type CountHistoryRow = {
  id: string;
  countDate: string;
  createdAt: string;
  previousQuantity: number;
  currentQuantity: number;
  difference: number;
  note: string | null;
  countedBy: { id: string; fullName: string; email: string } | null;
  product: { id: string; name: string; location: string; unit: string | null };
};
