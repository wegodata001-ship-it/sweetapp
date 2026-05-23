/** זמן יעד לספירת מדף — לפי כמות מוצרים */
export function shelfCountTargetMinutes(productCount: number): number {
  if (productCount <= 0) return 20;
  return Math.min(90, Math.max(15, Math.ceil(productCount * 1.5)));
}

export function formatCountElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type ShelfCountSession = {
  startedAt: string;
  targetMinutes: number;
};
