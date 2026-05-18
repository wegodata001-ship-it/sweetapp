const ALIAS_BLOCK_RE = /\[ocr-aliases:\s*([^\]]+)\]/i;

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
  if (existing.some((a) => a.toLowerCase() === clean.toLowerCase())) {
    return base;
  }
  const next = [...existing, clean].slice(-12);
  const block = `[ocr-aliases: ${next.join(" | ")}]`;
  return base ? `${base}\n${block}` : block;
}
