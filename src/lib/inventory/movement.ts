/** מפתחות תנועה ב־DB — תואמים UI */
export const INVENTORY_MOVEMENT_KEYS = [
  "STOCK_IN",
  "SHORTAGE",
  "DAMAGE",
  "RETURN",
  "STOCK_FIX",
  "TRANSFER",
] as const;

export type InventoryMovementKey = (typeof INVENTORY_MOVEMENT_KEYS)[number];

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementKey, string> = {
  STOCK_IN: "הוספת מלאי",
  SHORTAGE: "חוסר",
  DAMAGE: "נזק",
  RETURN: "החזרה",
  STOCK_FIX: "תיקון מלאי",
  TRANSFER: "העברת מלאי",
};

/** שינוי נטו במלאי (יחידות שלמות) */
export function inventoryMovementDelta(type: string, quantity: number): number {
  const q = Math.floor(Math.abs(quantity));
  const signed = Math.trunc(quantity);
  switch (type) {
    case "STOCK_IN":
    case "RETURN":
      return q;
    case "SHORTAGE":
    case "DAMAGE":
      return -q;
    case "STOCK_FIX":
      return signed;
    case "TRANSFER":
      return 0;
    default:
      return 0;
  }
}

export function isValidMovementType(t: string): t is InventoryMovementKey {
  return (INVENTORY_MOVEMENT_KEYS as readonly string[]).includes(t);
}
