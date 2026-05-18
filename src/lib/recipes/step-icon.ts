/** ברירת מחדל לאייקון שלב לפי מילות מפתח (ניתן לדרוס בשדה icon) */
export function suggestStepIcon(title: string, explicit?: string | null): string {
  if (explicit?.trim()) return explicit.trim();
  const t = title.toLowerCase();
  if (/ערבוב|mix|blend/.test(t)) return "🥣";
  if (/אפייה|אופה|oven|bake/.test(t)) return "🔥";
  if (/קירור|cool|chill|fridge/.test(t)) return "❄️";
  if (/אריזה|pack|wrap/.test(t)) return "📦";
  if (/חיתוך|cut|slice/.test(t)) return "🔪";
  return "✨";
}
