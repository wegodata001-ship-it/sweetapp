const LRM = "\u200E";

export function formatShekel(value: number): string {
  const amount = value.toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  });
  return `${LRM}₪${amount}${LRM}`;
}

export function parseNum(raw: string): number {
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
