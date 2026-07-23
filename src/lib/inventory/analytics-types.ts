export type AnalyticsRange = "day" | "week" | "month" | "year" | "custom";

export type AnalyticsFilters = {
  from: string;
  to: string;
  range: AnalyticsRange;
  locationId?: string;
  workerId?: string;
  category?: string;
  productId?: string;
};

export type AnalyticsKpis = {
  totalProducts: number;
  totalLocations: number;
  totalCounts: number;
  activeCounts: number;
  avgAccuracyPct: number;
  shortageProducts: number;
  surplusProducts: number;
  totalUnits: number;
  uncountedOver30Days: number;
  avgCountDurationMinutes: number | null;
};

export type NamedQty = { id: string; name: string; quantity: number; meta?: string };

export type TrendPoint = { period: string; usage: number; surplus: number; counts: number };

export type WorkerStat = {
  id: string;
  name: string;
  productsCounted: number;
  unitsCounted: number;
  avgDurationMinutes: number | null;
  errorCount: number;
  diffCount: number;
  accuracyPct: number;
  areaCount: number;
  areas: string[];
};

export type LocationStat = {
  id: string;
  name: string;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  accuracyPct: number;
  avgDurationMinutes: number | null;
  lastCountedAt: string | null;
  lastCountedBy: string | null;
};

export type ForecastItem = {
  id: string;
  name: string;
  currentQty: number;
  dailyUsage: number;
  daysLeft: number | null;
  orderInDays: number | null;
  covers3d: boolean;
  covers7d: boolean;
  covers30d: boolean;
};

export type CriticalBuckets = {
  belowMinimum: NamedQty[];
  endsThisWeek: NamedQty[];
  neverCounted: NamedQty[];
  noMovement: NamedQty[];
  anomalous: NamedQty[];
};

export type HeatCell = { day: number; hour: number; value: number };

export type AnalyticsDashboardDto = {
  generatedAt: string;
  filters: AnalyticsFilters;
  kpis: AnalyticsKpis;
  usage: {
    daily: TrendPoint[];
    weekly: TrendPoint[];
    monthly: TrendPoint[];
    yearly: TrendPoint[];
  };
  topProducts: {
    mostUsed: NamedQty[];
    leastUsed: NamedQty[];
    noMovement: NamedQty[];
    anomalous: NamedQty[];
    nearMinimum: NamedQty[];
  };
  workers: WorkerStat[];
  locations: LocationStat[];
  forecast: ForecastItem[];
  critical: CriticalBuckets;
  heatmap: HeatCell[];
  meta: {
    categories: string[];
    locations: { id: string; name: string }[];
    workers: { id: string; name: string }[];
    /** שדות שלא קיימים ב־InventoryProduct */
    unsupportedFilters: string[];
  };
};

export type AnalyticsDrillType =
  | "shortages"
  | "surpluses"
  | "uncounted"
  | "belowMinimum"
  | "noMovement"
  | "activeLocations"
  | "counts"
  | "workers"
  | "locations";

export type AnalyticsDrillRow = {
  id: string;
  title: string;
  subtitle?: string;
  value?: number;
  meta?: string;
};
