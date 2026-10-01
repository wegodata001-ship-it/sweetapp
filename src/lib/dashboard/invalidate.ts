import { revalidateTag } from "next/cache";
import { clearDashboardSnapshot } from "@/lib/dashboard/snapshot";
import { clearSharedForecastReads } from "@/lib/finance/shared-forecast-reads";

export const DASHBOARD_CACHE_TAG = "dashboard";

/** Drop request-local document reuse and the 20s dashboard cache after a finance write. */
export function invalidateDashboardCaches(): void {
  clearSharedForecastReads();
  clearDashboardSnapshot();
  try {
    revalidateTag(DASHBOARD_CACHE_TAG, { expire: 0 });
  } catch {
    /* not inside a Next request */
  }
}
