/**
 * Pure helpers for inventory-count list persistence (remove + reorder).
 * Used by the count UI, product-order API, and unit tests — no DB I/O here.
 */

/** Hide soft-removed products from the count roster without touching the catalog. */
export function applyExclusionsToOrderedIds(
  orderedIds: string[],
  excludedProductIds: Iterable<string>,
): string[] {
  const excluded = excludedProductIds instanceof Set
    ? excludedProductIds
    : new Set(excludedProductIds);
  if (excluded.size === 0) return orderedIds.slice();
  return orderedIds.filter((id) => !excluded.has(id));
}

/**
 * Merge a drag-and-drop front list into the full shelf order.
 * Front ids that are not on this shelf are dropped; remaining shelf ids keep
 * relative order after the front — so other locations are never affected.
 */
export function mergeShelfProductOrder(
  frontProductIds: string[],
  shelfOrderedIds: string[],
): string[] {
  const shelfSet = new Set(shelfOrderedIds);
  const front: string[] = [];
  const seen = new Set<string>();
  for (const raw of frontProductIds) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id) || !shelfSet.has(id)) continue;
    seen.add(id);
    front.push(id);
  }
  const rest = shelfOrderedIds.filter((id) => !seen.has(id));
  return [...front, ...rest];
}

/** 1-based displayOrder map for a shelf-local product list. */
export function displayOrderByProductId(orderedIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  orderedIds.forEach((id, index) => {
    map.set(id, index + 1);
  });
  return map;
}

/**
 * Re-apply a previously saved shelf order after a reload.
 * Unknown ids (new products) stay at the end in their incoming relative order.
 */
export function sortIdsBySavedOrder(
  incomingIds: string[],
  savedOrderedIds: string[],
): string[] {
  if (savedOrderedIds.length === 0) return incomingIds.slice();
  const incoming = new Set(incomingIds);
  const head = savedOrderedIds.filter((id) => incoming.has(id));
  const headSet = new Set(head);
  const tail = incomingIds.filter((id) => !headSet.has(id));
  return [...head, ...tail];
}
