import {
  callGeminiGenerateContent,
  geminiModelName,
  isGeminiConfigured,
} from "./gemini-client";
import { ScanServiceError } from "./scan-errors";

export type GeminiInvoiceJson = {
  supplier: string | null;
  invoiceNumber: string | null;
  date: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  documentType: string | null;
  lineItems: Array<{
    name: string | null;
    quantity: number | null;
    unitPrice: number | null;
    lineTotal: number | null;
  }>;
};

export type GeminiVisionResult = {
  provider: "gemini_vision";
  model: string;
  invoice: GeminiInvoiceJson;
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
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const clean = value.replace(/[₪,\s]/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const parsed = Number.parseFloat(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLineItems(value: unknown): GeminiInvoiceJson["lineItems"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : null;
      const quantity = normalizeMoney(record.quantity);
      const unitPrice = normalizeMoney(record.unitPrice);
      const lineTotal = normalizeMoney(record.lineTotal);
      if (!name && quantity == null && unitPrice == null && lineTotal == null) return null;
      return { name, quantity, unitPrice, lineTotal };
    })
    .filter((item): item is GeminiInvoiceJson["lineItems"][number] => item != null)
    .slice(0, 120);
}

function parseGeminiJson(raw: string): GeminiInvoiceJson {
  const clean = stripJsonFence(raw);
  const parsed = JSON.parse(clean) as Partial<GeminiInvoiceJson>;

  return {
    supplier: typeof parsed.supplier === "string" && parsed.supplier.trim() ? parsed.supplier.trim() : null,
    invoiceNumber:
      typeof parsed.invoiceNumber === "string" && parsed.invoiceNumber.trim()
        ? parsed.invoiceNumber.trim()
        : null,
    date:
      typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date.trim())
        ? parsed.date.trim()
        : null,
    subtotal: normalizeMoney(parsed.subtotal),
    vat: normalizeMoney(parsed.vat),
    total: normalizeMoney(parsed.total),
    documentType:
      typeof parsed.documentType === "string" && parsed.documentType.trim()
        ? parsed.documentType.trim()
        : null,
    lineItems: normalizeLineItems((parsed as { lineItems?: unknown }).lineItems),
  };
}

export async function runGeminiVision(input: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  intakeMode: "quick" | "full";
  pageCount?: number;
  pageNumber?: number;
}): Promise<GeminiVisionResult> {
  if (!isGeminiConfigured()) {
    throw new ScanServiceError("SCAN_NOT_CONFIGURED", "Gemini AI is not configured");
  }

  const model = geminiModelName();
  const isPdf = input.mimeType === "application/pdf";
  const multiPageHint =
    input.pageCount != null && input.pageCount > 1
      ? `\nהמסמך מכיל ${input.pageCount} עמודים. קרא את כל העמודים ומזג למסמך אחד:
- שדות כותרת (ספק, מספר חשבונית, תאריך) — מהעמוד הראשון שבו מופיעים.
- lineItems — איחוד מכל העמודים (ללא כפילויות).
- subtotal/vat/total — מהעמוד האחרון עם סיכום / סה"כ לתשלום.\n`
      : input.pageNumber != null && input.pageCount != null && input.pageCount > 1
        ? `\nזהו עמוד ${input.pageNumber} מתוך ${input.pageCount}. חלץ רק נתונים שמופיעים בעמוד זה.\n`
        : "";

  const prompt = `אתה מנוע סריקת מסמכים פיננסיים.
קבל את המסמך כ-PDF או תמונה והחזר JSON תקין בלבד, ללא Markdown וללא הסברים.
${multiPageHint}
סוגי מסמכים אפשריים: חשבונית, קבלה, חשבונית מס, חשבונית מס קבלה, דוח Z, זיכוי.

כללים קשיחים:
- אסור להמציא מידע.
- אם שדה לא זוהה בבירור, החזר null.
- אל תחזיר טקסט משוער או ג'יבריש.
- תאריך חייב להיות YYYY-MM-DD.
- סכומים חייבים להיות מספרים בלבד, ללא ₪ או פסיקים.
- חלץ שורות מוצרים רק אם הן מופיעות בבירור. אל תמציא שורות.
- אם לא זוהו שורות מוצרים בבירור, החזר lineItems כמערך ריק.

preferredIntakeMode: ${input.intakeMode}

מבנה JSON חובה:
{
  "supplier": string | null,
  "invoiceNumber": string | null,
  "date": "YYYY-MM-DD" | null,
  "subtotal": number | null,
  "vat": number | null,
  "total": number | null,
  "documentType": string | null,
  "lineItems": [
    {
      "name": string | null,
      "quantity": number | null,
      "unitPrice": number | null,
      "lineTotal": number | null
    }
  ]
}`;

  console.log("[DOCUMENT_SCAN_PROVIDER]", {
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

  console.log("[GEMINI_VISION_RAW_RESPONSE]", rawResponse.slice(0, 4000));

  const invoice = parseGeminiJson(text);
  const detected = [
    invoice.supplier,
    invoice.invoiceNumber,
    invoice.date,
    invoice.subtotal,
    invoice.vat,
    invoice.total,
    invoice.lineItems.length > 0 ? invoice.lineItems.length : null,
  ].filter((value) => value != null).length;

  return {
    provider: "gemini_vision",
    model,
    invoice,
    rawResponse,
    confidence: detected > 0 ? Math.min(0.98, 0.72 + detected * 0.04) : 0.2,
  };
}

export function isGeminiVisionConfigured(): boolean {
  return isGeminiConfigured();
}
