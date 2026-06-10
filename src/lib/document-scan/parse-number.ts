/** פירוק מספרים מטקst OCR — ללא תלות בשכבת ה-parsing הישנה. */

const AMOUNT_RE =
  /\d{1,3}(?:,\d{3})+\.\d{1,2}|\d{1,3}(?:,\d{3})+|\d+\.\d{1,2}|\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+/g;

export function parseAmount(raw: string): number {
  if (!raw) return NaN;
  let s = raw
    .replace(/[\u20AA\u20AC\u0024\u00A3₪]/g, "")
    .replace(/\s/g, "")
    .trim();
  if (/,\d{3}/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  return Number.parseFloat(s);
}

export function extractAmountsFromLine(line: string): number[] {
  const tokens: string[] = [];
  const re = new RegExp(AMOUNT_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[0]);
  }
  if (tokens.length === 0) return [];

  // העדפת סכומים עם נקודה עשרונית (1925.00 לפני 192)
  tokens.sort((a, b) => {
    const aDec = /\.\d{1,2}$/.test(a) ? 1 : 0;
    const bDec = /\.\d{1,2}$/.test(b) ? 1 : 0;
    if (bDec !== aDec) return bDec - aDec;
    return b.length - a.length;
  });

  const out: number[] = [];
  for (const raw of tokens) {
    const n = parseAmount(raw);
    if (Number.isFinite(n) && n > 0 && n < 500_000) out.push(n);
  }
  return out;
}
