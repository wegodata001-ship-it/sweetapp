import {
  callGeminiGenerateContent,
  geminiModelName,
  isGeminiConfigured,
} from "./gemini-client";
import { ScanServiceError } from "./scan-errors";

export type GeminiZReportJson = {
  zNumber: string | null;
  date: string | null;
  cashTaxable: number | null;
  cashExempt: number | null;
  creditTaxable: number | null;
  creditExempt: number | null;
  transfers: number | null;
  grandTotal: number | null;
};

export type GeminiZReportVisionResult = {
  provider: "gemini_vision";
  model: string;
  zReport: GeminiZReportJson;
  rawResponse: string;
  confidence: number;
};

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== "string") return null;
  const clean = value.replace(/[₪,\s]/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const parsed = Number.parseFloat(clean);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function parseGeminiZJson(raw: string): GeminiZReportJson {
  const clean = stripJsonFence(raw);
  const parsed = JSON.parse(clean) as Partial<GeminiZReportJson>;

  return {
    zNumber:
      typeof parsed.zNumber === "string" && parsed.zNumber.trim() ? parsed.zNumber.trim() : null,
    date:
      typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date.trim())
        ? parsed.date.trim()
        : null,
    cashTaxable: normalizeMoney(parsed.cashTaxable),
    cashExempt: normalizeMoney(parsed.cashExempt),
    creditTaxable: normalizeMoney(parsed.creditTaxable),
    creditExempt: normalizeMoney(parsed.creditExempt),
    transfers: normalizeMoney(parsed.transfers),
    grandTotal: normalizeMoney(parsed.grandTotal),
  };
}

export async function runGeminiZReportVision(input: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  pageCount?: number;
  pageNumber?: number;
}): Promise<GeminiZReportVisionResult> {
  if (!isGeminiConfigured()) {
    throw new ScanServiceError("SCAN_NOT_CONFIGURED", "Gemini AI is not configured");
  }

  const model = geminiModelName();
  const multiPageHint =
    input.pageCount != null && input.pageCount > 1
      ? `\nהמסמך מכיל ${input.pageCount} עמודים. קרא את כל העמודים ומזג לדוח Z אחד.\n`
      : input.pageNumber != null && input.pageCount != null && input.pageCount > 1
        ? `\nזהו עמוד ${input.pageNumber} מתוך ${input.pageCount}.\n`
        : "";

  const prompt = `אתה מנוע סריקת דוחות Z (סיכום קופה יומי).
קבל את המסמך כ-PDF או תמונה והחזר JSON תקין בלבד, ללא Markdown וללא הסברים.
${multiPageHint}
כללים קשיחים:
- אסור להמציא מידע.
- אם שדה לא זוהה בבירור, החזר null.
- תאריך חייב להיות YYYY-MM-DD.
- סכומים חייבים להיות מספרים בלבד (0 מותר), ללא ₪ או פסיקים.
- grandTotal הוא הסכום הכולל של דוח Z אם מופיע במסמך.

מבנה JSON חובה:
{
  "zNumber": string | null,
  "date": "YYYY-MM-DD" | null,
  "cashTaxable": number | null,
  "cashExempt": number | null,
  "creditTaxable": number | null,
  "creditExempt": number | null,
  "transfers": number | null,
  "grandTotal": number | null
}`;

  console.log("[Z_REPORT_SCAN_PROVIDER]", {
    scanProvider: "gemini_vision",
    model,
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.buffer.length,
  });

  const { rawResponse, text } = await callGeminiGenerateContent({
    model,
    requestBody: {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: input.mimeType,
                data: input.buffer.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        response_mime_type: "application/json",
      },
    },
  });

  console.log("[GEMINI_Z_REPORT_RAW_RESPONSE]", rawResponse.slice(0, 4000));

  const zReport = parseGeminiZJson(text);
  const detected = [
    zReport.zNumber,
    zReport.date,
    zReport.cashTaxable,
    zReport.cashExempt,
    zReport.creditTaxable,
    zReport.creditExempt,
    zReport.transfers,
    zReport.grandTotal,
  ].filter((value) => value != null).length;

  return {
    provider: "gemini_vision",
    model,
    zReport,
    rawResponse,
    confidence: detected > 0 ? Math.min(0.98, 0.72 + detected * 0.04) : 0.2,
  };
}

export { isGeminiConfigured as isGeminiVisionConfigured } from "./gemini-client";
