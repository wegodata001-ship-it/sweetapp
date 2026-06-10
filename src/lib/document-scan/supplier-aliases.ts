const ALIAS_BLOCK_RE = /\[ocr-aliases:\s*([^\]]+)\]/i;

/** Built-in groups for common Israeli suppliers (OCR name variants). */
const KNOWN_SUPPLIER_GROUPS: string[][] = [
  ["עבאסי", "עבאסי שיווק", 'עבאסי שיווק בע"מ', "עבאסי שיווק בעמ"],
];

function inKnownSupplierGroup(name: string): boolean {
  const n = normalizeSupplierName(name);
  if (!n) return false;
  for (const group of KNOWN_SUPPLIER_GROUPS) {
    for (const label of group) {
      const g = normalizeSupplierName(label);
      if (n === g || n.includes(g) || g.includes(n)) return true;
    }
  }
  return false;
}

function sameKnownSupplierGroup(a: string, b: string): boolean {
  if (!inKnownSupplierGroup(a) || !inKnownSupplierGroup(b)) return false;
  const na = normalizeSupplierName(a);
  const nb = normalizeSupplierName(b);
  for (const group of KNOWN_SUPPLIER_GROUPS) {
    const norms = group.map((l) => normalizeSupplierName(l));
    const inA = norms.some((g) => na.includes(g) || g.includes(na));
    const inB = norms.some((g) => nb.includes(g) || g.includes(nb));
    if (inA && inB) return true;
  }
  return false;
}

const LEGAL_SUFFIX_RE =
  /\b(בע[\"']?מ|בעמ|בה\"מ|בה״מ|בע״מ|ltd|limited|inc|corp|company|חברה)\b/gi;

export function normalizeSupplierName(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u0591-\u05C7\u064B-\u0652]/g, "")
    .replace(LEGAL_SUFFIX_RE, " ")
    .replace(/["'״׳.,\-_/()[\]{}!?:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Same supplier under different legal/display names (מאור סחר / מאור סחר בע"מ). */
export function supplierNamesMatch(a: string, b: string): boolean {
  const na = normalizeSupplierName(a);
  const nb = normalizeSupplierName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (sameKnownSupplierGroup(a, b)) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = na.split(/\s+/).filter((t) => t.length >= 2);
  const tb = nb.split(/\s+/).filter((t) => t.length >= 2);
  if (ta.length === 0 || tb.length === 0) return false;

  const setB = new Set(tb);
  let overlap = 0;
  for (const t of ta) {
    if (setB.has(t)) overlap += 1;
  }
  const minLen = Math.min(ta.length, tb.length);
  return overlap >= minLen && overlap / minLen >= 0.85;
}

export function parseSupplierAliases(notes: string | null | undefined): string[] {
  if (!notes) return [];
  const m = notes.match(ALIAS_BLOCK_RE);
  if (!m?.[1]) return [];
  return m[1]
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

export function appendSupplierAlias(notes: string | null | undefined, alias: string): string {
  const clean = alias.trim();
  if (!clean) return notes?.trim() ?? "";
  const existing = parseSupplierAliases(notes);
  const base = (notes ?? "").replace(ALIAS_BLOCK_RE, "").trim();
  if (
    existing.some(
      (a) =>
        a.toLowerCase() === clean.toLowerCase() || supplierNamesMatch(a, clean),
    )
  ) {
    return base;
  }
  const next = [...existing, clean].slice(-12);
  const block = `[ocr-aliases: ${next.join(" | ")}]`;
  return base ? `${base}\n${block}` : block;
}

/** All names to compare for a supplier row (canonical + aliases). */
export function supplierMatchLabels(name: string, notes?: string | null): string[] {
  const labels = [name.trim(), ...parseSupplierAliases(notes)];
  for (const group of KNOWN_SUPPLIER_GROUPS) {
    if (group.some((g) => supplierNamesMatch(g, name))) {
      labels.push(...group);
    }
  }
  return [...new Set(labels.filter((l) => l.length >= 2))];
}
