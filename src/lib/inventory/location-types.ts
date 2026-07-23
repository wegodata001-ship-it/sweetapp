/** סוגי מיקום אחסון — ערכים ב-DB באנגלית */
export const LOCATION_TYPES = [
  "WAREHOUSE",
  "SHOWROOM",
  "STORE",
  "COLD",
  "FREEZER",
  "OTHER",
] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

export function isLocationType(v: string): v is LocationType {
  return (LOCATION_TYPES as readonly string[]).includes(v);
}

/** סטטוס ספירה נגזר מהנתונים + סשן לקוח */
export type CountLifecycleStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export const LOCATION_TYPE_I18N: Record<LocationType, string> = {
  WAREHOUSE: "ops.inventory.warehouse.locationTypes.WAREHOUSE",
  SHOWROOM: "ops.inventory.warehouse.locationTypes.SHOWROOM",
  STORE: "ops.inventory.warehouse.locationTypes.STORE",
  COLD: "ops.inventory.warehouse.locationTypes.COLD",
  FREEZER: "ops.inventory.warehouse.locationTypes.FREEZER",
  OTHER: "ops.inventory.warehouse.locationTypes.OTHER",
};

export const COUNT_STATUS_I18N: Record<CountLifecycleStatus, string> = {
  NOT_STARTED: "ops.inventory.warehouse.countStatus.NOT_STARTED",
  IN_PROGRESS: "ops.inventory.warehouse.countStatus.IN_PROGRESS",
  COMPLETED: "ops.inventory.warehouse.countStatus.COMPLETED",
};

/** צבעי כרטיס אופציונליים */
export const LOCATION_COLORS = [
  "#0f172a",
  "#1e3a5f",
  "#14532d",
  "#7c2d12",
  "#4c1d95",
  "#0e7490",
  "#9f1239",
] as const;
