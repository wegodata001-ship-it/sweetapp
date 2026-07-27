"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  ScanLine,
  Settings2,
  X,
} from "lucide-react";
import { resolveCountLineStatus } from "@/components/ops/inventory-count/count-product-status";
import type {
  InventoryCountProductRow,
  LocationWorkerDto,
} from "@/components/ops/inventory-count/types";
import type { CountSessionDetail } from "@/lib/inventory/count-session-service";
import {
  ShelfCountLineRow,
  ShelfCountTableHeader,
  sumWorkerQuantities,
  type WorkerQtyMap,
} from "./shelf-count-line-row";
import { LocationWorkersModal } from "./location-workers-modal";
import { ProductEditModal, type ProductEditValues } from "./product-edit-modal";
import { CountRowRemoveConfirmModal } from "./count-row-remove-confirm-modal";
import { CountSummaryModal } from "./count-summary-modal";
import { CountSummaryEmailModal } from "./count-summary-email-modal";

/** גובה משוער לשורת טבלה / כרטיס — כולל ריבועי مواقع الجرد */
const TABLE_ROW_BASE = 112;
const TABLE_SITE_ROW = 78;
const CARD_ROW_BASE = 300;
/** כל מיקום ספירה בכרטיס: תווית + שורת ➖ כמות ➕ */
const CARD_SITE_ROW = 92;
const REFRESH_SHELVES_MS = 1200;
const ORDER_SAVE_MS = 500;
const MOBILE_MQ = "(max-width: 767px)";
/** מתחת לסף הזה מדובר בסרגל כתובת ולא במקלדת */
const KEYBOARD_MIN_INSET = 120;
/** עמוד ראשון קטן — אין pageSize 500; המשך ב־infinite scroll */
const COUNT_PAGE_SIZE = 80;

/** טעינת ברירת מחדל מהספירה האחרונה — לא מאפסים ל־0 */
function buildPrefillFromLastCount(
  rows: InventoryCountProductRow[],
  workers: LocationWorkerDto[],
): { actual: Record<string, string>; workerQty: Record<string, WorkerQtyMap> } {
  const actual: Record<string, string> = {};
  const workerQty: Record<string, WorkerQtyMap> = {};
  for (const row of rows) {
    if (workers.length > 0) {
      const map: WorkerQtyMap = {};
      const last = row.lastWorkerQtys ?? [];
      if (last.length > 0) {
        for (const w of workers) {
          const found = last.find((l) => l.inventoryLocationWorkerId === w.id);
          map[w.id] = found != null ? String(found.countedQuantity) : "0";
        }
      } else {
        const first = workers[0];
        if (first) {
          map[first.id] = String(row.previousQuantity ?? 0);
          for (let i = 1; i < workers.length; i++) {
            map[workers[i]!.id] = "0";
          }
        }
      }
      workerQty[row.id] = map;
    } else {
      actual[row.id] = String(row.previousQuantity ?? 0);
    }
  }
  return { actual, workerQty };
}

function useIsMobileLayout() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(MOBILE_MQ);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return isMobile;
}

/**
 * כמה פיקסלים מהמסך מכוסים במקלדת הווירטואלית.
 * אנדרואיד/ספארי מרחפים את המקלדת מעל ה־layout viewport, כך ש־100dvh נשאר
 * בגובה המלא וסרגלי sticky bottom נשארים מתחת למקלדת. הקיזוז מחזיר אותם למסך.
 * סף KEYBOARD_MIN_INSET מונע רעידות כשסרגל הכתובת נפתח/נסגר בגלילה.
 */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      setInset(hidden > KEYBOARD_MIN_INSET ? Math.round(hidden) : 0);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      setInset(0);
    };
  }, [active]);
  return inset;
}

/** כפתור אייקון בסרגל התחתון — שטח נגיעה 48px ומעלה */
function MobileBarButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-12 w-11 shrink-0 place-items-center rounded-2xl border border-[#e7ecf5] bg-white text-slate-700 transition active:scale-95 disabled:opacity-40 sm:w-12"
    >
      {icon}
    </button>
  );
}

type Props = {
  open: boolean;
  shelfName: string;
  locationId?: string | null;
  countDate: string;
  /** שעת פתיחת הספירה — נשמרת עם הסשן לחישוב משך הספירה בדוחות */
  startedAt?: string | null;
  /** צפייה בספירה מההיסטוריה */
  sessionId?: string | null;
  readOnly?: boolean;
  /** הסרת שורה מהספירה — מנהל מערכת / בעל העסק בלבד */
  canRemoveRows?: boolean;
  /** צפייה בסיכומי ספירות ושליחתם במייל — מנהל מערכת / בעל העסק בלבד */
  canViewSummaries?: boolean;
  onClose: () => void;
  onShelfStatsChange?: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

/** שורה שהוסרה — נשמרת בזיכרון כדי לאפשר שחזור מיידי ללא טעינה מחדש */
type RemovedRowSnapshot = {
  row: InventoryCountProductRow;
  index: number;
  actual?: string;
  workerQty?: WorkerQtyMap;
};

async function downloadSessionExport(sessionId: string, format: "pdf" | "xlsx") {
  const res = await fetch(
    `/api/inventory/count-sessions/${encodeURIComponent(sessionId)}/export?format=${format}`,
    { credentials: "same-origin" },
  );
  if (!res.ok) throw new Error("export failed");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const raw =
    res.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''(.+)/)?.[1] ??
    `count.${format}`;
  try {
    a.download = decodeURIComponent(raw);
  } catch {
    a.download = raw;
  }
  a.click();
  URL.revokeObjectURL(a.href);
}

function ShelfCountModalInner({
  open,
  shelfName,
  locationId,
  countDate,
  startedAt = null,
  sessionId = null,
  readOnly = false,
  canRemoveRows = false,
  canViewSummaries = false,
  onClose,
  onShelfStatsChange,
  t,
}: Props) {
  const [products, setProducts] = useState<InventoryCountProductRow[]>([]);
  const [workers, setWorkers] = useState<LocationWorkerDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listTotal, setListTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState(2);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionNumber, setSessionNumber] = useState<number | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  /** תאימות לאחור — כשאין עובדים במיקום */
  const [actualById, setActualById] = useState<Record<string, string>>({});
  /** productId → workerId → qty */
  const [workerQtyByProduct, setWorkerQtyByProduct] = useState<
    Record<string, WorkerQtyMap>
  >({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  /** רק מוצרים שהמשתמש שינה — prefill לא נחשב dirty */
  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set());
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [summariesOpen, setSummariesOpen] = useState(false);
  const [summaryEmailOpen, setSummaryEmailOpen] = useState(false);
  /** הסרת שורה מהספירה — יעד האישור, מזהה בתהליך, ואחרונה שהוסרה (לשחזור) */
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<RemovedRowSnapshot | null>(null);
  const [workersOpen, setWorkersOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductEditValues | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanQ, setScanQ] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const [dragProductId, setDragProductId] = useState<string | null>(null);
  const isMobile = useIsMobileLayout();
  const keyboardInset = useKeyboardInset(open && isMobile);
  const rowVariant = isMobile ? ("card" as const) : ("table" as const);
  const siteCount = Math.max(workers.length, 1);
  const rowHeight = isMobile
    ? CARD_ROW_BASE + siteCount * CARD_SITE_ROW
    : TABLE_ROW_BASE + Math.ceil(siteCount / 3) * TABLE_SITE_ROW;

  const listRef = useRef<HTMLDivElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const loadingMoreRef = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;

  const markTouched = useCallback((productId: string) => {
    setTouchedIds((prev) => {
      if (prev.has(productId)) return prev;
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
  }, []);

  /**
   * טעינה יחידה בפתיחה — ללא תלות ב־t / callbacks לא יציבים.
   * (ההורה מרענן כל שנייה לטיימר ספירה; t inline היה גורם ללולאת refetch + loading אינסופי)
   */
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const ac = new AbortController();

    setSavingIds(new Set());
    setTouchedIds(new Set());
    setDragProductId(null);
    setConfirmCloseOpen(false);
    setWorkersOpen(false);
    setEditProduct(null);
    setRemoveTarget(null);
    setRemovingId(null);
    setLastRemoved(null);
    setNotice(null);
    setError(null);
    setScanQ("");
    setScrollTop(0);
    setExporting(null);
    setLoading(true);
    setLoadingMore(false);
    loadingMoreRef.current = false;
    setHasMore(false);
    setNextPage(2);
    setListTotal(0);

    const finish = () => {
      if (!cancelled) setLoading(false);
    };

    void (async () => {
      try {
        if (sessionId) {
          setActiveSessionId(sessionId);
          const res = await fetch(
            `/api/inventory/count-sessions/${encodeURIComponent(sessionId)}`,
            { credentials: "same-origin", cache: "no-store", signal: ac.signal },
          );
          const j = (await res.json()) as {
            ok?: boolean;
            data?: CountSessionDetail;
            error?: string;
          };
          if (cancelled) return;
          if (!res.ok || !j.ok || !j.data) {
            setError(j.error ?? tRef.current("saveFailed"));
            setProducts([]);
            setWorkers([]);
            return;
          }
          const detail = j.data;
          setActiveSessionId(detail.id);
          setSessionNumber(detail.sessionNumber);
          const workerMap = new Map<string, LocationWorkerDto>();
          const nextWorkerQty: Record<string, WorkerQtyMap> = {};
          const nextActual: Record<string, string> = {};
          for (const line of detail.lines) {
            nextActual[line.inventoryProductId] = String(line.currentQuantity);
            const wmap: WorkerQtyMap = {};
            for (const w of line.workers) {
              wmap[w.inventoryLocationWorkerId] = String(w.countedQuantity);
              if (!workerMap.has(w.inventoryLocationWorkerId)) {
                workerMap.set(w.inventoryLocationWorkerId, {
                  id: w.inventoryLocationWorkerId,
                  displayName: w.workerDisplayName,
                  workArea: w.workerWorkArea,
                  displayOrder: workerMap.size,
                });
              }
            }
            nextWorkerQty[line.inventoryProductId] = wmap;
          }
          setWorkers([...workerMap.values()]);
          setWorkerQtyByProduct(nextWorkerQty);
          setActualById(nextActual);
          const sessionProducts = detail.lines.map((line) => ({
            id: line.inventoryProductId,
            name: line.name,
            nameHe: line.nameHe,
            nameAr: line.nameAr,
            nameEn: line.nameEn,
            barcode: line.barcode,
            sku: line.sku,
            location: detail.locationName,
            locationId: detail.locationId,
            unit: line.unit,
            previousQuantity: line.previousQuantity,
            systemTotalQuantity: line.previousQuantity,
            systemShortage:
              line.minimumQuantity > 0
                ? Math.max(0, line.minimumQuantity - line.currentQuantity)
                : 0,
            minimumQuantity: line.minimumQuantity,
            lastCountedAt: detail.createdAt,
          }));
          setProducts(sessionProducts);
          setListTotal(sessionProducts.length);
          setHasMore(false);
          return;
        }

        setActiveSessionId(null);
        setSessionNumber(null);

        if (!shelfName.trim() && !locationId?.trim()) {
          setProducts([]);
          setWorkers([]);
          setActualById({});
          setWorkerQtyByProduct({});
          return;
        }

        const params = new URLSearchParams({
          page: "1",
          pageSize: String(COUNT_PAGE_SIZE),
        });
        if (locationId?.trim()) params.set("locationId", locationId.trim());
        if (shelfName.trim()) params.set("location", shelfName.trim());
        // מסנן בשרת מוצרים שהוסרו מסבב הספירה של אותו יום
        if (countDate) params.set("countDate", countDate);
        const res = await fetch(`/api/inventory/monthly-count?${params}`, {
          credentials: "same-origin",
          signal: ac.signal,
        });
        const j = (await res.json()) as {
          data?: InventoryCountProductRow[];
          meta?: {
            workers?: LocationWorkerDto[];
            total?: number;
            hasMore?: boolean;
            page?: number;
            pageSize?: number;
          };
          ok?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(j.error ?? tRef.current("saveFailed"));
          setProducts([]);
          setWorkers([]);
          setActualById({});
          setWorkerQtyByProduct({});
          return;
        }
        const rows = j.data ?? [];
        const nextWorkers = j.meta?.workers ?? [];
        const prefill = buildPrefillFromLastCount(rows, nextWorkers);
        setProducts(rows);
        setWorkers(nextWorkers);
        setActualById(prefill.actual);
        setWorkerQtyByProduct(prefill.workerQty);
        setTouchedIds(new Set());
        setListTotal(j.meta?.total ?? rows.length);
        setHasMore(Boolean(j.meta?.hasMore));
        setNextPage(2);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setProducts([]);
        setWorkers([]);
        setError(tRef.current("saveFailed"));
      } finally {
        finish();
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
    // countDate הוא מחרוזת יציבה (יום נוכחי) — לא גורם ל-refetch מחזורי
  }, [open, shelfName, locationId, sessionId, countDate]);

  const loadMoreProducts = useCallback(async () => {
    if (sessionId || readOnly) return;
    if (!hasMore || loading || loadingMoreRef.current) return;
    if (!shelfName.trim() && !locationId?.trim()) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(COUNT_PAGE_SIZE),
      });
      if (locationId?.trim()) params.set("locationId", locationId.trim());
      if (shelfName.trim()) params.set("location", shelfName.trim());
      if (countDate) params.set("countDate", countDate);
      const res = await fetch(`/api/inventory/monthly-count?${params}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as {
        data?: InventoryCountProductRow[];
        meta?: { total?: number; hasMore?: boolean };
        ok?: boolean;
      };
      if (!res.ok) return;
      const rows = j.data ?? [];
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const row of rows) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            merged.push(row);
          }
        }
        return merged;
      });
      // prefill רק לשורות חדשות — prev גובר (כבר נטען / נערך)
      const prefill = buildPrefillFromLastCount(rows, workers);
      setActualById((prev) => ({ ...prefill.actual, ...prev }));
      setWorkerQtyByProduct((prev) => ({ ...prefill.workerQty, ...prev }));
      setListTotal(j.meta?.total ?? listTotal);
      setHasMore(Boolean(j.meta?.hasMore));
      setNextPage((p) => p + 1);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    countDate,
    hasMore,
    listTotal,
    loading,
    locationId,
    nextPage,
    readOnly,
    sessionId,
    shelfName,
    workers,
  ]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, [open, loading, products.length]);

  /** אם הרשימה קצרה מהמסך ועדיין יש עמודים — טען אוטומטית (אין גלילה) */
  useEffect(() => {
    if (!open || loading || sessionId || readOnly) return;
    if (!hasMore || loadingMore) return;
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 80) {
      void loadMoreProducts();
    }
  }, [open, loading, sessionId, readOnly, hasMore, loadingMore, products.length, loadMoreProducts]);

  const scheduleShelfRefresh = useCallback(() => {
    if (!onShelfStatsChange) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      onShelfStatsChange();
      refreshTimer.current = null;
    }, REFRESH_SHELVES_MS);
  }, [onShelfStatsChange]);

  const setActual = useCallback(
    (productId: string, value: string) => {
      setNotice(null);
      setError(null);
      markTouched(productId);
      setActualById((prev) => ({ ...prev, [productId]: value }));
    },
    [markTouched],
  );

  const setWorkerQty = useCallback(
    (productId: string, workerId: string, value: string) => {
      setNotice(null);
      setError(null);
      markTouched(productId);
      setWorkerQtyByProduct((prev) => ({
        ...prev,
        [productId]: { ...(prev[productId] ?? {}), [workerId]: value },
      }));
    },
    [markTouched],
  );

  const bump = useCallback(
    (productId: string, systemQty: number, delta: number) => {
      setNotice(null);
      setError(null);
      markTouched(productId);
      if (workers.length > 0) {
        const firstWorkerId = workers[0]?.id;
        if (!firstWorkerId) return;
        setWorkerQtyByProduct((prev) => {
          const map = prev[productId] ?? {};
          const raw = map[firstWorkerId] ?? "";
          const base = raw === "" ? 0 : Number(raw);
          const next = Math.max(0, (Number.isNaN(base) ? 0 : base) + delta);
          return { ...prev, [productId]: { ...map, [firstWorkerId]: String(next) } };
        });
        return;
      }
      setActualById((prev) => {
        const raw = prev[productId] ?? "";
        const base = raw === "" ? systemQty : Number(raw);
        const next = Math.max(0, (Number.isNaN(base) ? systemQty : base) + delta);
        return { ...prev, [productId]: String(next) };
      });
    },
    [markTouched, workers],
  );

  const persistProductOrder = useCallback(
    (orderedIds: string[]) => {
      if (orderTimer.current) clearTimeout(orderTimer.current);
      orderTimer.current = setTimeout(() => {
        void (async () => {
          try {
            await fetch("/api/inventory/product-order", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({
                productIds: orderedIds,
                locationId: locationId?.trim() || undefined,
                location: shelfName.trim() || undefined,
              }),
            });
          } catch {
            /* שמירת סדר לא חוסמת ספירה */
          }
        })();
      }, ORDER_SAVE_MS);
    },
    [locationId, shelfName],
  );

  const reorderProduct = useCallback(
    (fromId: string, toId: string) => {
      if (!fromId || !toId || fromId === toId) return;
      if (scanQ.trim()) return;
      setProducts((prev) => {
        const fromIdx = prev.findIndex((p) => p.id === fromId);
        const toIdx = prev.findIndex((p) => p.id === toId);
        if (fromIdx < 0 || toIdx < 0) return prev;
        const next = [...prev];
        const [item] = next.splice(fromIdx, 1);
        if (!item) return prev;
        next.splice(toIdx, 0, item);
        const withOrder = next.map((p, i) => ({ ...p, displayOrder: i + 1 }));
        persistProductOrder(withOrder.map((p) => p.id));
        return withOrder;
      });
    },
    [persistProductOrder, scanQ],
  );

  /** פרמטרי הסבב הנוכחי — מיקום + יום הספירה */
  const roundParams = useCallback(() => {
    const params = new URLSearchParams();
    if (locationId?.trim()) params.set("locationId", locationId.trim());
    if (shelfName.trim()) params.set("location", shelfName.trim());
    if (countDate) params.set("countDate", countDate);
    return params;
  }, [countDate, locationId, shelfName]);

  /**
   * הסרת מוצר מהספירה הנוכחית — Optimistic.
   * השורה נעלמת מיד וה־KPI מתעדכן; אם השרת מסרב, השורה מוחזרת בדיוק למקומה.
   * המוצר עצמו אינו נמחק — לא מהקטלוג, לא מהמדף ולא מספירות עבר.
   */
  const removeRowFromCount = useCallback(
    async (productId: string) => {
      const index = products.findIndex((p) => p.id === productId);
      if (index < 0) return;
      const snapshot: RemovedRowSnapshot = {
        row: products[index]!,
        index,
        actual: actualById[productId],
        workerQty: workerQtyByProduct[productId],
      };

      setRemovingId(productId);
      setError(null);
      setNotice(null);

      // הסרה אופטימית — כולל ניקוי כל ה-state הנלווה ועדכון סך הפריטים
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setListTotal((prev) => Math.max(0, prev - 1));
      setActualById((prev) => {
        if (!(productId in prev)) return prev;
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      setWorkerQtyByProduct((prev) => {
        if (!(productId in prev)) return prev;
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      setTouchedIds((prev) => {
        if (!prev.has(productId)) return prev;
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
      setSavingIds((prev) => {
        if (!prev.has(productId)) return prev;
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
      rowRefs.current.delete(productId);

      const rollback = () => {
        setProducts((prev) => {
          if (prev.some((p) => p.id === productId)) return prev;
          const next = [...prev];
          next.splice(Math.min(snapshot.index, next.length), 0, snapshot.row);
          return next;
        });
        setListTotal((prev) => prev + 1);
        if (snapshot.actual !== undefined) {
          setActualById((prev) => ({ ...prev, [productId]: snapshot.actual! }));
        }
        if (snapshot.workerQty !== undefined) {
          setWorkerQtyByProduct((prev) => ({ ...prev, [productId]: snapshot.workerQty! }));
        }
      };

      try {
        const res = await fetch("/api/inventory/count-exclusions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            inventoryProductId: productId,
            locationId: locationId?.trim() || undefined,
            location: shelfName.trim() || undefined,
            countDate,
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          rollback();
          setError(j.error ?? t("removeRowFailed"));
          return;
        }
        setLastRemoved(snapshot);
        setNotice(t("removeRowDone", { name: snapshot.row.name }));
        scheduleShelfRefresh();
      } catch {
        rollback();
        setError(t("removeRowFailed"));
      } finally {
        setRemovingId(null);
      }
    },
    [
      actualById,
      countDate,
      locationId,
      products,
      scheduleShelfRefresh,
      shelfName,
      t,
      workerQtyByProduct,
    ],
  );

  /** שחזור המוצר האחרון שהוסר — מחזיר את השורה למקומה ללא טעינה מחדש */
  const restoreLastRemoved = useCallback(async () => {
    const snapshot = lastRemoved;
    if (!snapshot) return;
    const productId = snapshot.row.id;
    setRemovingId(productId);
    setError(null);
    try {
      const params = roundParams();
      params.set("inventoryProductId", productId);
      const res = await fetch(`/api/inventory/count-exclusions?${params}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("removeRowFailed"));
        return;
      }
      setProducts((prev) => {
        if (prev.some((p) => p.id === productId)) return prev;
        const next = [...prev];
        next.splice(Math.min(snapshot.index, next.length), 0, snapshot.row);
        return next;
      });
      setListTotal((prev) => prev + 1);
      if (snapshot.actual !== undefined) {
        setActualById((prev) => ({ ...prev, [productId]: snapshot.actual! }));
      } else {
        const prefill = buildPrefillFromLastCount([snapshot.row], workers);
        setActualById((prev) => ({ ...prefill.actual, ...prev }));
        setWorkerQtyByProduct((prev) => ({ ...prefill.workerQty, ...prev }));
      }
      if (snapshot.workerQty !== undefined) {
        setWorkerQtyByProduct((prev) => ({ ...prev, [productId]: snapshot.workerQty! }));
      }
      setLastRemoved(null);
      setNotice(t("restoreRowDone", { name: snapshot.row.name }));
      scheduleShelfRefresh();
    } catch {
      setError(t("removeRowFailed"));
    } finally {
      setRemovingId(null);
    }
  }, [lastRemoved, roundParams, scheduleShelfRefresh, t, workers]);

  const sortedProducts = useMemo(() => {
    const q = scanQ.trim().toLowerCase();
    if (!q) return products;
    const hit = products.filter(
      (p) =>
        p.id === q ||
        (p.barcode ?? "").toLowerCase() === q ||
        (p.sku ?? "").toLowerCase() === q ||
        p.name.toLowerCase().includes(q) ||
        (p.nameAr ?? "").toLowerCase().includes(q) ||
        (p.nameEn ?? "").toLowerCase().includes(q),
    );
    if (hit.length === 0) return products;
    const hitSet = new Set(hit.map((p) => p.id));
    return [...hit, ...products.filter((p) => !hitSet.has(p.id))];
  }, [products, scanQ]);

  /** הכרטיס שהסריקה הגיעה אליו — מודגש כל עוד יש טקסט חיפוש */
  const highlightId =
    scanQ.trim() && sortedProducts.length > 0 ? sortedProducts[0].id : null;

  useEffect(() => {
    if (!highlightId) return;
    rowRefs.current.get(highlightId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightId]);

  const useVirtual = sortedProducts.length > 40;
  const totalH = sortedProducts.length * rowHeight;
  const startIdx = useVirtual ? Math.max(0, Math.floor(scrollTop / rowHeight) - 2) : 0;
  const endIdx = useVirtual
    ? Math.min(sortedProducts.length, Math.ceil((scrollTop + viewportH) / rowHeight) + 2)
    : sortedProducts.length;
  const visible = sortedProducts.slice(startIdx, endIdx);
  const padTop = startIdx * rowHeight;
  const padBottom = Math.max(0, (sortedProducts.length - endIdx) * rowHeight);
  const hasWorkers = workers.length > 0;
  const dirtyProductIds = touchedIds;
  const hasDirtyChanges = dirtyProductIds.size > 0;
  const canDragReorder = !sessionId && !readOnly && !scanQ.trim();
  const hasInvalidChanges = useMemo(() => {
    if (hasWorkers) {
      for (const productId of dirtyProductIds) {
        const sum = sumWorkerQuantities(workers, workerQtyByProduct[productId] ?? {});
        if (sum !== null && Number.isNaN(sum)) return true;
      }
      return false;
    }
    return Object.entries(actualById)
      .filter(([, raw]) => raw !== "")
      .some(([, raw]) => {
        const n = Number(raw);
        return !Number.isFinite(n) || n < 0;
      });
  }, [actualById, dirtyProductIds, hasWorkers, workerQtyByProduct, workers]);
  const minimumSummary = useMemo(() => {
    let below = 0;
    for (const product of products) {
      if (product.minimumQuantity <= 0) continue;
      const systemTotal = product.systemTotalQuantity ?? product.previousQuantity;
      if (systemTotal < product.minimumQuantity) below += 1;
    }
    const total = listTotal > 0 ? listTotal : products.length;
    return {
      total,
      below,
      ok: Math.max(0, products.length - below),
      loaded: products.length,
    };
  }, [listTotal, products]);

  /**
   * עודפים — צבירה של אותו סטטוס שכל כרטיס כבר מציג (נספר > הספירה הקודמת במיקום).
   * תצוגה בלבד; אינו נוגע בחישובי השמירה.
   */
  const surplusCount = useMemo(() => {
    let surplus = 0;
    for (const product of products) {
      const counted = hasWorkers
        ? sumWorkerQuantities(workers, workerQtyByProduct[product.id] ?? {})
        : actualById[product.id] === "" || actualById[product.id] == null
          ? null
          : Number(actualById[product.id]);
      if (counted === null || !Number.isFinite(counted)) continue;
      if (resolveCountLineStatus(counted, product.previousQuantity) === "surplus") surplus += 1;
    }
    return surplus;
  }, [actualById, hasWorkers, products, workerQtyByProduct, workers]);

  const saveCount = useCallback(
    async (opts?: { closeAfterSave?: boolean }) => {
      type SaveLine = {
        inventoryProductId: string;
        currentQuantity: number;
        workers?: { inventoryLocationWorkerId: string; countedQuantity: number }[];
      };
      const lines: SaveLine[] = [];

      if (hasWorkers) {
        for (const productId of dirtyProductIds) {
          const map = workerQtyByProduct[productId] ?? {};
          const sum = sumWorkerQuantities(workers, map);
          if (sum === null || Number.isNaN(sum) || sum < 0) continue;
          lines.push({
            inventoryProductId: productId,
            currentQuantity: sum,
            workers: workers.map((w) => {
              const raw = map[w.id] ?? "";
              const qty = raw === "" ? 0 : Number(raw);
              return {
                inventoryLocationWorkerId: w.id,
                countedQuantity: Number.isFinite(qty) && qty >= 0 ? qty : 0,
              };
            }),
          });
        }
      } else {
        for (const id of dirtyProductIds) {
          const raw = actualById[id] ?? "";
          if (raw === "") continue;
          const qty = Number(raw);
          if (!Number.isFinite(qty) || qty < 0) continue;
          lines.push({ inventoryProductId: id, currentQuantity: qty });
        }
      }

      if (lines.length === 0) {
        setError(t("nothingToSave"));
        return false;
      }

      setSavingAll(true);
      setError(null);
      setNotice(null);
      setSavingIds(new Set(lines.map((line) => line.inventoryProductId)));
      try {
        const res = await fetch("/api/inventory/monthly-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            countDate,
            startedAt: startedAt ?? undefined,
            location: shelfName.trim() || undefined,
            locationId: locationId?.trim() || undefined,
            lines,
          }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          data?: {
            saved?: number;
            sessionId?: string;
            sessionNumber?: number;
            rows?: {
              inventoryProductId: string;
              currentQuantity: number;
              systemTotalQuantity?: number;
              systemShortage?: number;
              requiredQuantity?: number;
              workers?: {
                inventoryLocationWorkerId: string;
                countedQuantity: number;
              }[];
            }[];
          };
        };

        if (!res.ok || !j.ok) {
          setError(j.error ?? t("saveFailed"));
          return false;
        }

        const savedRows = j.data?.rows ?? [];
        setProducts((prev) => {
          const next = prev.map((product) => {
            const saved = savedRows.find((row) => row.inventoryProductId === product.id);
            if (!saved) return product;
            const systemTotal =
              saved.systemTotalQuantity ?? product.systemTotalQuantity ?? saved.currentQuantity;
            const required =
              saved.requiredQuantity ??
              saved.systemShortage ??
              Math.max(0, (product.minimumQuantity || 0) - systemTotal);
            return {
              ...product,
              previousQuantity: saved.currentQuantity,
              systemTotalQuantity: systemTotal,
              systemShortage: required,
              requiredQuantity: required,
              lastWorkerQtys:
                saved.workers?.map((w) => ({
                  inventoryLocationWorkerId: w.inventoryLocationWorkerId,
                  countedQuantity: w.countedQuantity,
                })) ?? product.lastWorkerQtys,
            };
          });
          // אחרי שמירה — ברירת המחדל = מה שנשמר (לא איפוס ל־0)
          const prefill = buildPrefillFromLastCount(next, workers);
          setActualById(prefill.actual);
          setWorkerQtyByProduct(prefill.workerQty);
          return next;
        });
        if (j.data?.sessionId) setActiveSessionId(j.data.sessionId);
        if (j.data?.sessionNumber != null) setSessionNumber(j.data.sessionNumber);
        setTouchedIds(new Set());
        setConfirmCloseOpen(false);
        setNotice(t("savedSuccess"));
        scheduleShelfRefresh();
        if (opts?.closeAfterSave) onClose();
        return true;
      } catch {
        setError(t("saveFailed"));
        return false;
      } finally {
        setSavingAll(false);
        setSavingIds(new Set());
      }
    },
    [
      actualById,
      countDate,
      dirtyProductIds,
      hasWorkers,
      locationId,
      onClose,
      scheduleShelfRefresh,
      shelfName,
      startedAt,
      t,
      workerQtyByProduct,
      workers,
    ],
  );

  const requestClose = useCallback(() => {
    if (savingAll) return;
    if (!readOnly && hasDirtyChanges) {
      setConfirmCloseOpen(true);
      return;
    }
    onClose();
  }, [hasDirtyChanges, onClose, readOnly, savingAll]);

  const exportSession = useCallback(
    async (format: "pdf" | "xlsx") => {
      if (!activeSessionId) return;
      setExporting(format);
      setError(null);
      try {
        await downloadSessionExport(activeSessionId, format);
      } catch {
        setError(t("exportFailed"));
      } finally {
        setExporting(null);
      }
    },
    [activeSessionId, t],
  );

  if (!open) return null;
  const isReadOnly = readOnly || !!sessionId;
  const canRemoveRow = canRemoveRows && !isReadOnly;
  const saveDisabled = savingAll || !hasDirtyChanges || hasInvalidChanges;
  const dirtyCount = dirtyProductIds.size;

  const saveButton = (extraClass: string) => (
    <button
      type="button"
      onClick={() => void saveCount()}
      disabled={saveDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-black text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 ${extraClass}`}
    >
      {savingAll ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Save className="h-4 w-4" aria-hidden />
      )}
      {t("saveCount")}
      {dirtyCount > 0 ? (
        <span className="rounded-full bg-white/25 px-1.5 text-[11px] tabular-nums">
          {dirtyCount}
        </span>
      ) : null}
    </button>
  );

  // z-200 ומעלה — מעל סרגלי המובייל של האפליקציה (header z-130, bottom nav z-120),
  // שאחרת מכסים את כפתור השמירה ואת סרגל הפעולות.
  return (
    <div className="fixed inset-0 z-[200] flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-md md:items-center md:p-3 lg:p-4">
      <div
        className="flex h-[100dvh] w-full max-w-[100vw] flex-col overflow-hidden rounded-none border border-white/10 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur-xl md:h-[96dvh] md:w-full md:max-w-none md:rounded-[24px] lg:h-[95dvh] lg:w-[95vw] lg:max-w-[95vw]"
        style={
          keyboardInset > 0 ? { height: `calc(100dvh - ${keyboardInset}px)` } : undefined
        }
        role="dialog"
        aria-modal="true"
        dir="rtl"
      >
        <header className="sticky top-0 z-10 shrink-0 border-b border-[#e7ecf5]/80 bg-white/90 px-3 py-2.5 backdrop-blur-md sm:px-5 sm:py-4">
          {/* שורה עליונה — השמירה נשארת כאן תמיד, מעל למקלדת ובלי גלילה */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={requestClose}
              aria-label={t("cancel")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-end">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#6c4cff]">
                {t("kicker")}
                {isReadOnly ? ` · ${t("readOnlyBadge")}` : ""}
              </p>
              <h2 className="truncate text-base font-black text-slate-900 sm:text-xl">
                {shelfName}
              </h2>
              {sessionNumber != null ? (
                <p className="truncate text-[11px] font-bold text-slate-500 sm:text-xs">
                  {t("sessionNumber", { n: sessionNumber })}
                </p>
              ) : null}
            </div>
            {!isReadOnly ? saveButton("h-12 shrink-0 px-4 text-sm") : null}
          </div>

          {/* פעולות משניות — במובייל הן יורדות לסרגל התחתון */}
          <div className="mt-3 hidden flex-wrap gap-2 md:flex">
            {!isReadOnly ? (
              <button
                type="button"
                disabled={!locationId}
                onClick={() => setWorkersOpen(true)}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-40 sm:flex-none"
              >
                <Settings2 className="h-4 w-4" />
                {t("editWorkers")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!activeSessionId || exporting !== null}
              onClick={() => void exportSession("pdf")}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-40 sm:flex-none"
            >
              {exporting === "pdf" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {t("exportPdf")}
            </button>
            <button
              type="button"
              disabled={!activeSessionId || exporting !== null}
              onClick={() => void exportSession("xlsx")}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-40 sm:flex-none"
            >
              {exporting === "xlsx" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              {t("exportExcel")}
            </button>
            {canViewSummaries ? (
              <>
                <button
                  type="button"
                  onClick={() => setSummariesOpen(true)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-xs font-black text-slate-700 sm:flex-none"
                >
                  <BarChart3 className="h-4 w-4" />
                  {t("openSummaries")}
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryEmailOpen(true)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-xs font-black text-slate-700 sm:flex-none"
                >
                  <Mail className="h-4 w-4" />
                  {t("sendSummaryEmail")}
                </button>
              </>
            ) : null}
          </div>

          {/* KPI — שתי שורות מסודרות במובייל, שורה אחת מ־sm */}
          <div className="mt-2.5 grid grid-cols-2 gap-2 text-center text-[11px] font-black sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 px-2 py-1.5 text-slate-700 ring-1 ring-slate-200">
              <p className="truncate text-[10px] text-slate-500">{t("summaryTotal")}</p>
              <p className="text-base tabular-nums">{minimumSummary.total}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-2 py-1.5 text-emerald-700 ring-1 ring-emerald-200">
              <p className="truncate text-[10px]">{t("summaryOk")}</p>
              <p className="text-base tabular-nums">{minimumSummary.ok}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 px-2 py-1.5 text-rose-700 ring-1 ring-rose-200">
              <p className="truncate text-[10px]">{t("summaryBelowMinimum")}</p>
              <p className="text-base tabular-nums">{minimumSummary.below}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-2 py-1.5 text-amber-700 ring-1 ring-amber-200">
              <p className="truncate text-[10px]">{t("summarySurplus")}</p>
              <p className="text-base tabular-nums">{surplusCount}</p>
            </div>
          </div>

          {notice ? (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {error}
            </p>
          ) : null}
          {lastRemoved && canRemoveRow ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <p className="text-xs font-bold text-slate-600">
                {t("removedFromCount", { name: lastRemoved.row.name })}
              </p>
              <button
                type="button"
                onClick={() => void restoreLastRemoved()}
                disabled={removingId !== null}
                className="inline-flex items-center gap-1 rounded-xl border border-[#e7ecf5] bg-white px-3 py-1.5 text-xs font-black text-[#6c4cff] transition hover:bg-[#f6f8fc] disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {t("restoreRow")}
              </button>
            </div>
          ) : null}

          <div className="relative mt-2.5">
            <ScanLine className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-[#6c4cff] ltr:left-3 rtl:right-3" />
            <input
              type="text"
              value={scanQ}
              onChange={(e) => setScanQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder={t("scanPlaceholder")}
              enterKeyHint="search"
              className="h-12 w-full rounded-2xl border border-[#e7ecf5] bg-[#f6f8fc] text-sm font-bold outline-none focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/15 ltr:pl-11 ltr:pr-11 rtl:pl-11 rtl:pr-11"
              /* אין autoFocus במובייל — המקלדת הייתה נפתחת מיד ומכסה את המסך */
              autoFocus={!isMobile}
            />
            {scanQ ? (
              <button
                type="button"
                onClick={() => setScanQ("")}
                aria-label={t("clearSearch")}
                className="absolute top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 ltr:right-1.5 rtl:left-1.5"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </header>

        <div
          ref={listRef}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 ${
            isMobile ? "overflow-x-hidden" : "overflow-x-auto"
          }`}
          onScroll={(e) => {
            const el = e.currentTarget;
            setScrollTop(el.scrollTop);
            const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 480;
            if (nearBottom) void loadMoreProducts();
          }}
        >
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#6c4cff]" />
            </div>
          ) : sortedProducts.length === 0 ? (
            <p className="py-12 text-center text-sm font-semibold text-slate-500">{t("empty")}</p>
          ) : (
            <div
              className={isMobile ? "w-full" : "min-w-max"}
              style={{ minHeight: useVirtual ? totalH : undefined }}
            >
              {!isMobile ? (
                <div className="sticky top-0 z-[1] mb-2 bg-white/95 pb-1 backdrop-blur-sm">
                  <ShelfCountTableHeader workers={workers} t={t} />
                </div>
              ) : null}
              {useVirtual ? <div style={{ height: padTop }} aria-hidden /> : null}
              <div className={isMobile ? "space-y-3" : "space-y-2"}>
                {visible.map((row) => {
                  const requiredQty =
                    row.requiredQuantity ??
                    row.systemShortage ??
                    Math.max(
                      0,
                      (row.minimumQuantity || 0) -
                        (row.systemTotalQuantity ?? row.previousQuantity),
                    );
                  return (
                    <div
                      key={row.id}
                      className={
                        highlightId === row.id
                          ? "rounded-2xl ring-2 ring-[#6c4cff] ring-offset-2 transition-shadow"
                          : undefined
                      }
                      ref={(el) => {
                        if (el) rowRefs.current.set(row.id, el);
                        else rowRefs.current.delete(row.id);
                      }}
                      onDragOver={(e) => {
                        if (!canDragReorder) return;
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        if (!canDragReorder || !dragProductId) return;
                        e.preventDefault();
                        reorderProduct(dragProductId, row.id);
                        setDragProductId(null);
                      }}
                    >
                      <ShelfCountLineRow
                        id={row.id}
                        name={row.name}
                        unit={row.unit}
                        locationName={isMobile ? shelfName : null}
                        systemQty={row.previousQuantity}
                        systemTotalQuantity={row.systemTotalQuantity ?? row.previousQuantity}
                        requiredQuantity={requiredQty}
                        minimumQuantity={row.minimumQuantity}
                        workers={workers}
                        workerQtys={workerQtyByProduct[row.id] ?? {}}
                        actualRaw={actualById[row.id] ?? ""}
                        saving={savingIds.has(row.id)}
                        readOnly={isReadOnly}
                        variant={rowVariant}
                        showColumnLabels={false}
                        draggable={canDragReorder}
                        canRemove={canRemoveRow}
                        removing={removingId === row.id}
                        onRemoveFromCount={() => {
                          if (isReadOnly || !canRemoveRow) return;
                          setRemoveTarget({ id: row.id, name: row.name });
                        }}
                        onDragStart={() => setDragProductId(row.id)}
                        onWorkerQtyChange={(workerId, v) => {
                          if (!isReadOnly) setWorkerQty(row.id, workerId, v);
                        }}
                        onActualChange={(v) => {
                          if (!isReadOnly) setActual(row.id, v);
                        }}
                        onBump={(d) => {
                          if (!isReadOnly) bump(row.id, row.previousQuantity, d);
                        }}
                        onEditProduct={() => {
                          if (isReadOnly) return;
                          setEditProduct({
                            id: row.id,
                            nameHe: row.nameHe ?? row.name,
                            unit: row.unit ?? "",
                            minimumQuantity: row.minimumQuantity,
                            maximumQuantity: row.maximumQuantity ?? null,
                          });
                        }}
                        t={t}
                      />
                    </div>
                  );
                })}
              </div>
              {useVirtual ? <div style={{ height: padBottom }} aria-hidden /> : null}
              {loadingMore ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-[#6c4cff]" />
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* סרגל פעולות תחתון — במובייל בלבד, מלווה את המסך לאורך כל הספירה */}
        <footer className="sticky bottom-0 z-10 shrink-0 border-t border-[#e7ecf5]/80 bg-white/95 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
          <div className="flex items-stretch gap-1.5">
            {!isReadOnly ? saveButton("h-12 flex-1 whitespace-nowrap px-2 text-xs") : null}
            {canViewSummaries ? (
              <>
                <MobileBarButton
                  label={t("openSummaries")}
                  icon={<BarChart3 className="h-5 w-5" aria-hidden />}
                  onClick={() => setSummariesOpen(true)}
                />
                <MobileBarButton
                  label={t("sendSummaryEmail")}
                  icon={<Mail className="h-5 w-5" aria-hidden />}
                  onClick={() => setSummaryEmailOpen(true)}
                />
              </>
            ) : null}
            <MobileBarButton
              label={t("exportPdf")}
              icon={
                exporting === "pdf" ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <FileText className="h-5 w-5" aria-hidden />
                )
              }
              disabled={!activeSessionId || exporting !== null}
              onClick={() => void exportSession("pdf")}
            />
            <MobileBarButton
              label={t("exportExcel")}
              icon={
                exporting === "xlsx" ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <FileSpreadsheet className="h-5 w-5" aria-hidden />
                )
              }
              disabled={!activeSessionId || exporting !== null}
              onClick={() => void exportSession("xlsx")}
            />
            {!isReadOnly ? (
              <MobileBarButton
                label={t("editWorkers")}
                icon={<Settings2 className="h-5 w-5" aria-hidden />}
                disabled={!locationId}
                onClick={() => setWorkersOpen(true)}
              />
            ) : null}
          </div>
        </footer>

        <footer className="sticky bottom-0 z-10 hidden shrink-0 items-center justify-between gap-2 border-t border-[#e7ecf5]/80 bg-white/95 px-3 py-3 backdrop-blur-md md:flex md:px-5">
          <button
            type="button"
            onClick={requestClose}
            disabled={savingAll}
            className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          {!isReadOnly ? saveButton("min-h-12 px-5 text-sm") : null}
        </footer>
      </div>

      {confirmCloseOpen ? (
        <div className="fixed inset-0 z-[205] flex items-center justify-center bg-slate-950/50 p-4">
          <div
          className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[24px] bg-white p-5 text-end shadow-2xl"
          dir="rtl"
        >
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black text-slate-900">{t("unsavedTitle")}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">{t("unsavedBody")}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 md:grid-cols-3">
              <button
                type="button"
                onClick={() => void saveCount({ closeAfterSave: true })}
                disabled={savingAll || hasInvalidChanges}
                className="min-h-12 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {t("saveAndExit")}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={savingAll}
                className="min-h-12 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
              >
                {t("exitWithoutSaving")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCloseOpen(false)}
                disabled={savingAll}
                className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {t("backToEdit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* סיכומי ספירות — חוצה מיקומים וטווחי תאריכים, אינו נוגע בסבב הנוכחי */}
      <CountSummaryModal open={summariesOpen} onClose={() => setSummariesOpen(false)} />
      <CountSummaryEmailModal
        open={summaryEmailOpen}
        onClose={() => setSummaryEmailOpen(false)}
      />

      <CountRowRemoveConfirmModal
        open={removeTarget !== null}
        productName={removeTarget?.name ?? ""}
        busy={removingId !== null}
        onCancel={() => {
          if (removingId !== null) return;
          setRemoveTarget(null);
        }}
        onConfirm={() => {
          const target = removeTarget;
          if (!target) return;
          setRemoveTarget(null);
          void removeRowFromCount(target.id);
        }}
      />

      <LocationWorkersModal
        open={workersOpen}
        locationId={locationId ?? null}
        onClose={() => setWorkersOpen(false)}
        onSaved={(next) => {
          setWorkers(next);
          // שומרים כמויות לפי workerId קיים; עובדים חדשים מתחילים מ־0
          setWorkerQtyByProduct((prev) => {
            const out: Record<string, WorkerQtyMap> = {};
            for (const [productId, map] of Object.entries(prev)) {
              const nextMap: WorkerQtyMap = {};
              for (const w of next) {
                nextMap[w.id] = map[w.id] ?? "0";
              }
              out[productId] = nextMap;
            }
            return out;
          });
        }}
        t={t}
      />

      <ProductEditModal
        open={editProduct !== null}
        initial={editProduct}
        onClose={() => setEditProduct(null)}
        onSaved={(p) => {
          setProducts((prev) =>
            prev.map((row) => {
              if (row.id !== p.id) return row;
              const minimumQuantity = p.minimumQuantity;
              const systemTotal = row.systemTotalQuantity ?? row.previousQuantity;
              const systemShortage =
                minimumQuantity > 0 ? Math.max(0, minimumQuantity - systemTotal) : 0;
              /** nameAr/nameEn/barcode/sku נשמרים מ-row — הטופס אינו עורך אותם */
              return {
                ...row,
                name: p.name,
                nameHe: p.nameHe,
                unit: p.unit || null,
                minimumQuantity,
                maximumQuantity: p.maximumQuantity,
                systemShortage,
                requiredQuantity: systemShortage,
              };
            }),
          );
          setNotice(t("productUpdated"));
        }}
        t={t}
      />
    </div>
  );
}

export const ShelfCountModal = memo(ShelfCountModalInner);
