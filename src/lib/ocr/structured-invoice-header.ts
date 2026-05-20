import { parseNumber } from "./hebrew-invoice-table-parser";
import { splitOcrLines } from "./normalize-ocr-text";
import type { OcrPositionedLine } from "./ocr-overlay";
import { normalizeRtlLine } from "./rtl-document-normalize";

export type StructuredHeader = {
  supplierRawName: string;
  supplierConfidence: number;
  invoiceNumber: string;
  invoiceNumberConfidence: number;
  date: string;
  dateConfidence: number;
  vatId: string;
  documentType: string;
  invoiceKind: "expense" | "credit";
  invoiceKindConfidence: number;
  total: number | null;
  totalConfidence: number;
  vatAmount: number | null;
  customerBlock: string;
  needsReview: string[];
};

function letterCount(s: string): number {
  return (s.match(/[a-zA-Z\u0590-\u05FF]/gi) ?? []).length;
}

function toIsoDate(raw: string): string {
  const m = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (!m) return "";
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const mo = String(Number(m[2])).padStart(2, "0");
  const d = String(Number(m[1])).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

const TOTAL_LINE_RE =
  /סה[\"']?כ\s*לתשלום|סהכ\s*לתשלום|יתרה\s*לתשלום|סך\s*הכל\s*לתשלום|כולל\s*מע[\"']?מ/i;

export function parseStructuredHeader(rawText: string, lines?: string[]): StructuredHeader {
  const L = lines ?? splitOcrLines(rawText);
  const text = rawText;
  const needsReview: string[] = [];

  let invoiceKind: "expense" | "credit" = "expense";
  let invoiceKindConfidence = 0.85;
  if (/חשבונית\s*מס\s*זיכוי|זיכוי/i.test(text)) {
    invoiceKind = "credit";
    invoiceKindConfidence = 0.92;
  } else if (/חשבונית\s*מס/i.test(text)) {
    invoiceKind = "expense";
    invoiceKindConfidence = 0.9;
  }

  let documentType =
    invoiceKind === "credit" ? "חשבונית מס זיכוי" : "חשבונית מס";

  let supplierRawName = "";
  let supplierConfidence = 0.4;
  for (let i = 0; i < Math.min(L.length, 22); i++) {
    const line = L[i].trim();
    if (/^לכבוד\s*:/i.test(line)) break;
    if (letterCount(line) < 4) continue;
    if (/חשבונית|תאריך|עוסק\s*מורשה|מספר\s*חשבונית/i.test(line) && !/בע[\"']?מ|בע״מ/i.test(line)) {
      continue;
    }
    if (/בע[\"']?מ|בע״מ|שיווק|סחר|מאפ|מפעל/i.test(line)) {
      supplierRawName = line
        .replace(/ח\.?\s*פ.*$/i, "")
        .replace(/עוסק.*$/i, "")
        .trim()
        .slice(0, 100);
      supplierConfidence = 0.92;
      break;
    }
  }
  if (!supplierRawName) {
    for (const line of L.slice(0, 12)) {
      if (letterCount(line) >= 6 && /בע[\"']?מ|בע״מ|שיווק/i.test(line)) {
        supplierRawName = line.slice(0, 100);
        supplierConfidence = 0.78;
        break;
      }
    }
  }
  if (!supplierRawName) needsReview.push("supplier");

  let invoiceNumber = "";
  let invoiceNumberConfidence = 0.35;
  const invPatterns = [
    /מספר\s*חשבונית[^\d]{0,20}(\d{2,8})/i,
    /חשבונית\s*מס[^\d]{0,25}(\d{2,8})/i,
    /מס['\s]*חשבונית[^\d]{0,15}(\d{2,8})/i,
  ];
  for (const re of invPatterns) {
    const m = text.match(re);
    if (m?.[1] && m[1].length <= 8) {
      invoiceNumber = m[1];
      invoiceNumberConfidence = 0.88;
      break;
    }
  }
  if (!invoiceNumber) needsReview.push("invoiceNumber");

  let date = "";
  let dateConfidence = 0.35;
  const dateM = text.match(/תאריך[^\d]{0,15}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i);
  if (dateM?.[1]) {
    date = toIsoDate(dateM[1]);
    dateConfidence = date ? 0.9 : 0.35;
  }
  if (!date) {
    const any = text.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/);
    if (any?.[1]) {
      date = toIsoDate(any[1]);
      dateConfidence = date ? 0.65 : 0.35;
    }
  }
  if (!date) needsReview.push("date");

  let vatId = "";
  const vatM = text.match(/(?:עוסק\s*מורשה|ח\.?\s*פ\.?|מס['\s]*עוסק)[^\d]{0,12}(\d{8,9})/i);
  if (vatM?.[1]) vatId = vatM[1];

  let total: number | null = null;
  let totalConfidence = 0.35;
  const totalCandidates: { n: number; score: number; idx: number }[] = [];

  for (let i = 0; i < L.length; i++) {
    const line = L[i];
    if (!TOTAL_LINE_RE.test(line) && !/^סה[\"']?כ\s*$/i.test(line.trim())) continue;
    const nums = [...line.matchAll(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+)/g)]
      .map((m) => parseNumber(m[1]))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 500_000);
    for (const n of nums) {
      let score = 0.7;
      if (/לתשלום|יתרה/i.test(line)) score = 0.95;
      if (/כולל\s*מע/i.test(line)) score = 0.85;
      totalCandidates.push({ n, score, idx: i });
    }
  }

  if (totalCandidates.length > 0) {
    totalCandidates.sort((a, b) => b.score - a.score || b.idx - a.idx);
    total = totalCandidates[0].n;
    totalConfidence = totalCandidates[0].score;
  } else {
    needsReview.push("total");
  }

  let vatAmount: number | null = null;
  const vatLine = text.match(/מע[\"']?מ[^\d]{0,20}([\d,.]+)/i);
  if (vatLine?.[1]) {
    const n = parseNumber(vatLine[1]);
    if (n > 0 && n < 50_000) vatAmount = n;
  }

  let customerBlock = "";
  const lkIdx = L.findIndex((l) => /^לכבוד\s*:/i.test(l.trim()));
  if (lkIdx >= 0) {
    customerBlock = L.slice(lkIdx, lkIdx + 4).join(" ").slice(0, 200);
  }

  if (supplierConfidence < 0.7) needsReview.push("supplier");
  if (totalConfidence < 0.7 && total != null) needsReview.push("total");

  return {
    supplierRawName,
    supplierConfidence,
    invoiceNumber,
    invoiceNumberConfidence,
    date,
    dateConfidence,
    vatId,
    documentType,
    invoiceKind,
    invoiceKindConfidence,
    total,
    totalConfidence,
    vatAmount,
    customerBlock,
    needsReview: [...new Set(needsReview)],
  };
}

/**
 * כותרת חשבונית מאזור עליון לפי Y — לא מתוך טקסט שטוח שבור.
 */
export function parseStructuredHeaderFromOverlay(
  overlay: OcrPositionedLine[],
  fullTextFallback = "",
): StructuredHeader {
  if (overlay.length === 0) {
    return parseStructuredHeader(fullTextFallback);
  }

  const maxTop = Math.max(...overlay.map((l) => l.top), 1);
  const headerCutoff = maxTop * 0.34;
  const headerLines = overlay
    .filter((l) => l.top <= headerCutoff)
    .map((l) => normalizeRtlLine(l.text))
    .filter((t) => t.length > 1);

  const headerBlock = headerLines.join("\n");
  const base = parseStructuredHeader(
    headerBlock.length > 20 ? headerBlock : fullTextFallback,
    headerLines,
  );

  if (base.supplierRawName) return base;

  const merged = parseStructuredHeader(fullTextFallback, splitOcrLines(fullTextFallback));
  return {
    ...merged,
    needsReview: [...new Set([...merged.needsReview, ...base.needsReview])],
  };
}
