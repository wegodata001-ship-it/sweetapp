/**
 * סטטוס סשן ספירה. ספירה שבוטלה נשארת במסד לצורכי ביקורת, אך אינה משתתפת
 * בדוחות, ב־KPI ובבסיס ההשוואה של הספירה הבאה.
 *
 * Backward compatible: כל הרשומות הקיימות הן COMPLETED (ברירת המחדל בסכימה),
 * ולכן הסינון להלן אינו משנה את התנהגות המערכת עד שמישהו מבטל ספירה בפועל.
 */

export const COUNT_SESSION_COMPLETED = "COMPLETED";
export const COUNT_SESSION_VOID = "VOID";

/** סשנים פעילים בלבד — לשילוב ב־where של InventoryCountSession */
export const ACTIVE_SESSION_WHERE = {
  status: { not: COUNT_SESSION_VOID },
};

/**
 * שורות ספירה פעילות — לשילוב ב־where של InventoryCount.
 * sessionId=null הן שורות ישנות שנשמרו לפני מנגנון הסשנים; הן תמיד פעילות.
 */
export const ACTIVE_COUNT_LINE_WHERE = {
  OR: [{ sessionId: null }, { session: { status: { not: COUNT_SESSION_VOID } } }],
};

/** SQL לשאילתות raw על InventoryCount שמצטרפות ל־InventoryCountSession */
export const ACTIVE_COUNT_LINE_SQL = `("c"."sessionId" IS NULL OR "s"."status" <> '${COUNT_SESSION_VOID}')`;

export function isVoidedSession(status: string | null | undefined): boolean {
  return status === COUNT_SESSION_VOID;
}
