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
  displayOrder?: number;
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

export type LastWorkerQtyDto = {
  inventoryLocationWorkerId: string;
  countedQuantity: number;
  workerWorkArea?: string | null;
  workerDisplayName?: string | null;
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
  /** מלאי במקום האחסון הנוכחי */
  locationQuantity?: number;
  /** במסך ספירה = מלאי המיקום; businessTotalQuantity לדוחות גלובליים */
  systemTotalQuantity?: number;
  businessTotalQuantity?: number;
  /** כמה חסר למינימום לפי מלאי המיקום (= الكمية المطلوبة) */
  systemShortage?: number;
  requiredQuantity?: number;
  minimumQuantity: number;
  maximumQuantity?: number | null;
  displayOrder?: number;
  lastCountedAt: string | null;
  /** פירוט עובדים מהספירה האחרונה — לטעינת ברירת מחדל */
  lastWorkerQtys?: LastWorkerQtyDto[];
  /** baseline לזיהוי Draft מיושן / concurrency בשמירה */
  latestCountId?: string | null;
  latestCountCreatedAt?: string | null;
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
