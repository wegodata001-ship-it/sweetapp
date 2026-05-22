"use client";

/** מסך ספירת מלאי פשוט — גריד מדפים + מודל (ללא workspace / 3 panels) */
export { InventoryWarehouseDashboard as InventoryCountDashboard } from "@/components/ops/inventory/inventory-warehouse-dashboard";

export type { ShelfSummary } from "./types";
export type { InventoryCountProductRow, MonthlyCountRow } from "./types";

/** @deprecated — הדשבורד החדש טוען נתונים בעצמו */
export type InventoryCountDashboardProps = Record<string, never>;
