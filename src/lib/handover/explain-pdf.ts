import { createPdf } from "@/lib/pdf/pdf-engine";

export async function businessExportExplainPdf(input: {
  generatedAt: string;
  modelCount: number;
  recordTotal: number;
}): Promise<Uint8Array> {
  const pdf = await createPdf({
    documentType: "generic",
    data: null,
    language: "he",
    title: "הסבר על נתוני העסק",
    subtitle: "חבילת ייצוא וגיבוי",
    headerMeta: [
      { label: "תאריך", value: input.generatedAt.slice(0, 10) },
      { label: "מטבע", value: "₪ ILS" },
    ],
    render: async (ctx) => {
      await ctx.layout.paragraph(
        "חבילה זו היא עותק מלא של נתוני העסק לקריאה ולגיבוי. הפעולה אינה מוחקת ואינה משנה מידע במערכת.",
      );
      await ctx.layout.gap(8);
      await ctx.layout.sectionTitle("מה בפנים");
      await ctx.layout.paragraph(
        "התיקיות 01–09 מיועדות לבעל העסק: קבצי אקסל בעברית, כרטסות, מלאי, משימות ומסמכים.",
      );
      await ctx.layout.paragraph(
        "התיקייה 99_גיבוי_טכני מיועדת למפתח: JSON, מילון שדות, ו-manifest לשחזור עתידי.",
      );
      await ctx.layout.sectionTitle("כספים");
      await ctx.layout.paragraph(
        "בתיקיית הכספים נמצאים נתוני מקור: תשלומים, מסמכים, תנועות כרטסת ותזרים. כרטסות מחושבות מסומנות כנתון נגזר — לשחזור יש להשתמש בקבצי המקור.",
      );
      await ctx.layout.sectionTitle("אבטחה");
      await ctx.layout.paragraph(
        "סיסמאות, מזהי התחברות וטוקנים לא נכללים. משתמשים מיוצאים עם שם, אימייל, תפקיד וסטטוס בלבד.",
      );
      await ctx.layout.sectionTitle("סיכום");
      await ctx.layout.infoPanel(
        [
          { label: "מודלים", value: String(input.modelCount) },
          { label: "רשומות", value: String(input.recordTotal) },
          { label: "מטבע", value: "ILS" },
          { label: "שינוי במערכת", value: "לא" },
        ],
        2,
      );
    },
  });
  return pdf.bytes;
}
