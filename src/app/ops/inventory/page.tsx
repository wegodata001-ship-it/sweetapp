"use client";

import { InventoryWarehouseDashboard } from "@/components/ops/inventory/inventory-warehouse-dashboard";

/** מסך ספירת מלאי — מדפים בלבד, ספירה ב-popup */
export default function InventoryPage() {
  return (
    <div className="mx-auto min-h-0 max-w-7xl px-3 py-4 md:px-5 md:py-6" style={{ background: "#f6f8fc" }}>
      <InventoryWarehouseDashboard />
    </div>
  );
}
