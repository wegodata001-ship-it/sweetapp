/**
 * הרשאות ניהוליות במודול הספירה — מנהל מערכת ובעל העסק בלבד.
 * מודול טהור (ללא prisma) כדי שגם ה־UI וגם ה־API ישתמשו באותה הגדרה.
 */

function isInventoryManager(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

/**
 * הסרת שורה מהספירה מותרת ל־SUPER_ADMIN (מנהל מערכת) ול־ADMIN (בעל העסק) בלבד.
 * מכוון שזו בדיקה מחמירה מ־canManageInventory: עובד עם הרשאת "inventory"
 * יכול לספור ולערוך כמויות, אך לא להסיר מוצר מהספירה.
 */
export function canRemoveCountRow(role: string | null | undefined): boolean {
  return isInventoryManager(role);
}

/**
 * צפייה בסיכומי ספירות חוצי־מיקומים ושליחתם במייל.
 * סיכום חושף נתוני ספירה של כל המיקומים ושל כל העובדים, ולכן מוגבל לאותם
 * תפקידים כמו הסרת שורה — עובד שסופר מדף בודד אינו רואה את התמונה המלאה.
 */
export function canViewCountSummary(role: string | null | undefined): boolean {
  return isInventoryManager(role);
}

/**
 * ביטול סבב ספירה שגוי. הביטול מוציא את הסשן מהדוחות, מה־KPI ומבסיס ההשוואה
 * של הספירה הבאה, ולכן שמור לאותם תפקידים בלבד.
 */
export function canVoidCountSession(role: string | null | undefined): boolean {
  return isInventoryManager(role);
}
