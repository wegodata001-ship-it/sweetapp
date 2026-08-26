import type { ShelfSummary } from "@/components/ops/inventory-count/types";

export type ProductTransferMode = "move" | "add";

export type ProductTransferResult = {
  mode: ProductTransferMode;
  productId: string;
  targetLocationId: string;
  targetName: string;
  sourceSummary?: ShelfSummary;
  targetSummary?: ShelfSummary;
};

function shelfApiPath(locationId: string | null, shelfName: string): string {
  return locationId?.trim() ? encodeURIComponent(locationId.trim()) : "by-name";
}

/** העברה — מסיר משיוך מקור (API transfer) */
export async function moveProductsToLocation(opts: {
  sourceLocationId: string | null;
  sourceName: string;
  targetLocationId: string;
  productIds: string[];
}): Promise<{
  moved: number;
  sourceSummary?: ShelfSummary;
  targetSummary?: ShelfSummary;
}> {
  const path = shelfApiPath(opts.sourceLocationId, opts.sourceName);
  const res = await fetch(`/api/inventory/shelves/${path}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      targetLocationId: opts.targetLocationId,
      shelfName: opts.sourceName,
      productIds: opts.productIds,
    }),
  });
  const j = (await res.json()) as {
    ok?: boolean;
    error?: string;
    data?: {
      moved?: number;
      sourceSummary?: ShelfSummary;
      targetSummary?: ShelfSummary;
    };
  };
  if (!res.ok || !j.ok) {
    throw new Error(j.error ?? "העברת המוצר נכשלה");
  }
  return {
    moved: j.data?.moved ?? 0,
    sourceSummary: j.data?.sourceSummary,
    targetSummary: j.data?.targetSummary,
  };
}

/** הוסף גם למיקום — לא מסיר ממקור (POST products בלי quantity) */
export async function addProductToLocation(opts: {
  targetLocationId: string;
  targetName: string;
  productId: string;
}): Promise<{ targetSummary?: ShelfSummary }> {
  const path = encodeURIComponent(opts.targetLocationId);
  const res = await fetch(`/api/inventory/shelves/${path}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      shelfName: opts.targetName,
      productId: opts.productId,
    }),
  });
  const j = (await res.json()) as {
    ok?: boolean;
    code?: string;
    error?: string;
    data?: { shelf?: ShelfSummary };
  };
  if (!res.ok || !j.ok) {
    if (j.code === "ALREADY_ON_SHELF") {
      throw new Error(j.error ?? "המוצר כבר קיים במיקום היעד");
    }
    throw new Error(j.error ?? "הוספת המוצר נכשלה");
  }
  return { targetSummary: j.data?.shelf };
}

export async function transferProduct(opts: {
  mode: ProductTransferMode;
  sourceLocationId: string | null;
  sourceName: string;
  targetLocationId: string;
  targetName: string;
  productId: string;
}): Promise<ProductTransferResult> {
  if (opts.mode === "add") {
    const { targetSummary } = await addProductToLocation({
      targetLocationId: opts.targetLocationId,
      targetName: opts.targetName,
      productId: opts.productId,
    });
    return {
      mode: "add",
      productId: opts.productId,
      targetLocationId: opts.targetLocationId,
      targetName: opts.targetName,
      targetSummary,
    };
  }
  const { sourceSummary, targetSummary, moved } = await moveProductsToLocation({
    sourceLocationId: opts.sourceLocationId,
    sourceName: opts.sourceName,
    targetLocationId: opts.targetLocationId,
    productIds: [opts.productId],
  });
  if (moved === 0) {
    throw new Error("המוצר לא נמצא במיקום המקור");
  }
  return {
    mode: "move",
    productId: opts.productId,
    targetLocationId: opts.targetLocationId,
    targetName: opts.targetName,
    sourceSummary,
    targetSummary,
  };
}
