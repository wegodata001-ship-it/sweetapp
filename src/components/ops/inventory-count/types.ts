export type ShelfSummary = {
  name: string;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  okCount: number;
  matchPct: number;
  locationId?: string | null;
  code?: string | null;
  description?: string | null;
  locationType?: string;
  targetProductCount?: number | null;
  color?: string | null;
  isActive?: boolean;
  createdAt?: string | null;
  countedProductCount?: number;
  lastCountAt?: string | null;
  lastCountedByName?: string | null;
  countStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
};

export type LocationWorkerDto = {
  id: string;
  inventoryLocationId?: string;
  employeeId?: string | null;
  displayName: string;
  workArea: string;
  displayOrder: number;
  isActive?: boolean;
};

export type InventoryCountProductRow = {
  id: string;
  name: string;
  nameHe?: string | null;
  nameAr?: string | null;
  nameEn?: string | null;
  barcode?: string | null;
  sku?: string | null;
  location: string;
  locationId?: string | null;
  unit: string | null;
  previousQuantity: number;
  /** סה״כ קיים בכל המערכת (כל המיקומים) */
  systemTotalQuantity?: number;
  /** כמה חסר במערכת מול המינימום */
  systemShortage?: number;
  minimumQuantity: number;
  maximumQuantity?: number | null;
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
