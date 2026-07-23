"use client";

import { InventoryAnalyticsDashboard } from "@/components/ops/inventory/analytics/inventory-analytics-dashboard";

/** Dashboard אנליטי נפרד — לא מחליף את מסך הספירה */
export default function InventoryAnalyticsPage() {
  return (
    <div
      className="mx-auto min-h-0 max-w-7xl px-3 py-4 md:px-5 md:py-6"
      style={{ background: "#f6f8fc" }}
    >
      <InventoryAnalyticsDashboard />
    </div>
  );
}
