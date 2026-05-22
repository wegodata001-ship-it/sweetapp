# שמירה על נתוני הלקוח — Prisma / מסד נתונים

## מצב נוכחי (נבדק)

- המסד **לא** מנוהל ע״י `prisma migrate` (`migrate status` → *not managed by Prisma Migrate*).
- תיקיית `prisma/migrations` **ריקה** — ההיסטוריה לא מסונכרנת עם Supabase.
- העדכונים עד כה נעשו בסגנון **`procurement-upgrade.sql`** / **`db push`** — לא מיגרציות מלאות.

לכן `npx prisma migrate dev` מנסה לבנות מסד “צל” מאפס ונכשל (שגיאת `FinancialDocument`) — **זה לא מחק את נתוני הלקוח**, רק חסם יצירת מיגרציה.

---

## אסור להריץ (מוחק / הורס נתונים)

| פקודה | סיכון |
|--------|--------|
| `npx prisma migrate reset` | **מוחק את כל המסד** |
| `npx prisma db push --force-reset` | **מוחק את כל המסד** |
| `DROP TABLE` / `TRUNCATE` ב-SQL | מחיקת נתונים |

---

## בטוח להריץ

### 1. תמיד מתוך תיקיית הפרויקט

```powershell
cd C:\Users\omer2\OneDrive\Desktop\Wego\sweet\wego-erp-v1
```

(ב־`wego\sweet` אין `schema.prisma` — לכן `prisma generate` נכשל שם.)

### 2. עדכון Prisma Client בלבד (בלי לגעת במסד)

```powershell
npx prisma generate
```

### 3. אינדקסים לביצועים — קובץ SQL בטוח

קובץ: `prisma/perf-indexes-upgrade.sql`  
רק `CREATE INDEX IF NOT EXISTS` — **לא נוגע בשורות קיימות**.

**מומלץ:** Supabase → SQL Editor → הדבק את הקובץ → Run.

או מהטרמינל (אחרי `cd wego-erp-v1`):

```powershell
npx prisma db execute --file prisma/perf-indexes-upgrade.sql
```

### 4. שינויי סכימה אחרים (עמודות / טבלאות)

כמו `procurement-upgrade.sql` — רק קבצים עם:

- `ADD COLUMN IF NOT EXISTS`
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`

**לפני הרצה:** גיבוי ב-Supabase (Settings → Database → Backup) או snapshot.

---

## `db push` — זהירות

```powershell
npx prisma db push
```

- **לא** מוחק את המסד כברירת מחדל.
- Prisma **מציג** מה ישתנה — אם מופיע `DROP` / איבוד עמודה → **עצור** (Ctrl+C).
- מתאים לסנכרון סכימה כשאין migrate — אבל תמיד לקרוא את התצוגה המקדימה.

---

## מתי להשתמש ב-`migrate dev`?

רק אחרי **baseline** למסד קיים (תיעוד Prisma: [Baselining](https://www.pris.ly/d/migrate-baseline)).  
עד אז — המשך עם קבצי `*-upgrade.sql` + `db execute`.

---

## סיכום מהיר

| מטרה | מה לעשות |
|------|-----------|
| Client בלבד | `cd wego-erp-v1` → `npx prisma generate` |
| אינדקסים | `perf-indexes-upgrade.sql` ב-Supabase |
| לא לאבד נתונים | לעולם לא `migrate reset` / `force-reset` |
