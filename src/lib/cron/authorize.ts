import type { NextRequest } from "next/server";

/**
 * אימות קריאת cron.
 *
 * מקבל את הסוד ב־x-cron-secret, ב־Authorization: Bearer או ב־?key=.
 * כשאין CRON_SECRET מוגדר (פיתוח) הנקודה פתוחה — יש להגדיר את המשתנה בפרודקשן.
 * זהו בדיוק המנגנון שכבר היה בשתי נקודות ה־cron הקיימות, שהוצא לכאן כדי שלכולן
 * תהיה אותה התנהגות.
 */
export function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return matchesCronSecret(req, secret);
}

/**
 * האם הקריאה הוכיחה שהיא מהמתזמן.
 *
 * שונה מ־authorizeCron: כאן היעדר CRON_SECRET אינו מזכה באישור. מיועד לפעולות
 * שאסור לאפשר להפעיל מבחוץ גם בסביבה שלא הוגדר בה סוד — למשל שליחה חוזרת
 * כפויה של דוח, שעוקפת את הגנת הכפילות ולכן יכולה לשלוח מיילים ללא הגבלה.
 */
export function isVerifiedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return matchesCronSecret(req, secret);
}

function matchesCronSecret(req: NextRequest, secret: string): boolean {
  const headerToken =
    req.headers.get("x-cron-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  if (headerToken && headerToken === secret) return true;
  const queryToken = req.nextUrl.searchParams.get("key")?.trim() ?? "";
  return Boolean(queryToken) && queryToken === secret;
}
