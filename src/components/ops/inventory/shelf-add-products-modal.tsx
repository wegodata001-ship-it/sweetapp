"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { useI18n } from "@/components/i18n-provider";
import type { ShelfSummary } from "@/components/ops/inventory-count/types";

type ProductPick = {
  id: string;
  name: string;
  unit: string | null;
  location: string;
  latestQuantity: number | null;
};

type Props = {
  open: boolean;
  shelfName: string;
  locationId: string | null;
  countDate: string;
  onClose: () => void;
  onShelfUpdated: (summary: ShelfSummary) => void;
};

export function ShelfAddProductsModal({
  open,
  shelfName,
  locationId,
  countDate,
  onClose,
  onShelfUpdated,
}: Props) {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const tM = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.warehouse.addProductsModal.${key}`, vars);

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductPick[]>([]);
  const [searching, setSearching] = useState(false);
  const [productId, setProductId] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newMinimum, setNewMinimum] = useState("0");
  const [quantity, setQuantity] = useState("");
  const [slotNote, setSlotNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existsPrompt, setExistsPrompt] = useState<{
    productId: string;
    name: string;
    qty: number;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shelfApiId = locationId ?? "by-name";

  useEffect(() => {
    if (!open) return;
    setMode("existing");
    setQ("");
    setResults([]);
    setProductId("");
    setNewName("");
    setNewUnit("");
    setNewMinimum("0");
    setQuantity("");
    setSlotNote("");
    setError(null);
    setExistsPrompt(null);
  }, [open, shelfName]);

  const searchProducts = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({ q: trimmed, page: "1", pageSize: "12" });
      const res = await fetch(`/api/inventory/count-products?${params}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { data?: ProductPick[] };
      setResults(j.data ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void searchProducts(q), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open, searchProducts]);

  const createNewProduct = async (): Promise<string | null> => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError(tM("newNameRequired"));
      return null;
    }
    const min = Number(newMinimum);
    if (!Number.isFinite(min) || min < 0) {
      setError(tM("invalidMinimum"));
      return null;
    }
    const res = await fetch("/api/inventory/count-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        name: trimmed,
        locationId: locationId ?? undefined,
        location: locationId ? undefined : shelfName,
        unit: newUnit.trim() || null,
        category: "כללי",
        minimumQuantity: min,
      }),
    });
    const j = (await res.json()) as {
      ok?: boolean;
      error?: string;
      data?: { id: string };
    };
    if (!res.ok || !j.ok || !j.data?.id) {
      setError(j.error ?? tM("createFailed"));
      return null;
    }
    return j.data.id;
  };

  const save = async (opts: { continueAfter?: boolean; increaseIfExists?: boolean }) => {
    const qtyRaw = quantity.trim();
    const qty = qtyRaw === "" ? null : Number(qtyRaw);
    if (qty !== null && (Number.isNaN(qty) || qty < 0)) {
      setError(tM("invalidQty"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let pid = productId;
      const isNewProduct = mode === "new";
      if (isNewProduct) {
        const createdId = await createNewProduct();
        if (!createdId) {
          setBusy(false);
          return;
        }
        pid = createdId;
      } else if (!pid) {
        setError(tM("pickProduct"));
        setBusy(false);
        return;
      }

      if (isNewProduct && qty !== null) {
        const countRes = await fetch("/api/inventory/count-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            inventoryProductId: pid,
            currentQuantity: qty,
            countDate,
            note: slotNote.trim() || null,
          }),
        });
        const countJ = (await countRes.json()) as { ok?: boolean; error?: string };
        if (!countRes.ok || !countJ.ok) {
          setError(countJ.error ?? tM("saveFailed"));
          setBusy(false);
          return;
        }
        const sumRes = await fetch("/api/inventory/shelf-summaries", {
          credentials: "same-origin",
        });
        const sumJ = (await sumRes.json()) as { data?: ShelfSummary[] };
        const summary = sumJ.data?.find(
          (s) => s.name.trim().toLowerCase() === shelfName.trim().toLowerCase(),
        );
        if (summary) onShelfUpdated(summary);
        showToast({
          tone: "success",
          title: isNewProduct ? tM("created") : tM("saved"),
          durationMs: 2000,
        });
        setNewName("");
        setNewUnit("");
        setNewMinimum("0");
        setQuantity("");
        setSlotNote("");
        if (!opts.continueAfter) onClose();
        setBusy(false);
        return;
      }

      if (isNewProduct) {
        const sumRes = await fetch("/api/inventory/shelf-summaries", {
          credentials: "same-origin",
        });
        const sumJ = (await sumRes.json()) as { data?: ShelfSummary[] };
        const summary = sumJ.data?.find(
          (s) => s.name.trim().toLowerCase() === shelfName.trim().toLowerCase(),
        );
        if (summary) onShelfUpdated(summary);
        showToast({ tone: "success", title: tM("created"), durationMs: 2000 });
        setNewName("");
        setNewUnit("");
        setNewMinimum("0");
        setQuantity("");
        setSlotNote("");
        if (!opts.continueAfter) onClose();
        setBusy(false);
        return;
      }

      const res = await fetch(`/api/inventory/shelves/${shelfApiId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          shelfName,
          productId: pid,
          quantity: qty,
          slotNote: slotNote.trim() || null,
          increaseIfExists: opts.increaseIfExists ?? false,
          countDate,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        code?: string;
        error?: string;
        data?: { shelf?: ShelfSummary; productId?: string };
      };

      if (j.code === "ALREADY_ON_SHELF" && !opts.increaseIfExists) {
        const picked = results.find((r) => r.id === pid);
        setExistsPrompt({
          productId: pid,
          name: picked?.name ?? newName.trim(),
          qty: qty ?? 0,
        });
        setBusy(false);
        return;
      }

      if (!res.ok || !j.ok || !j.data?.shelf) {
        setError(j.error ?? tM("saveFailed"));
        return;
      }

      onShelfUpdated(j.data.shelf);
      showToast({ tone: "success", title: tM("saved"), durationMs: 2000 });
      setExistsPrompt(null);
      setProductId("");
      setNewName("");
      setNewUnit("");
      setNewMinimum("0");
      setQuantity("");
      setSlotNote("");
      setQ("");
      setResults([]);

      if (!opts.continueAfter) onClose();
    } catch {
      setError(tM("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const selected = results.find((r) => r.id === productId);

  return (
    <>
      <div
        dir={dir}
        className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-[24px] border border-[#e7ecf5] bg-white shadow-2xl sm:rounded-[24px]">
          <header className="flex items-center justify-between border-b border-[#e7ecf5] px-4 py-4">
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-end">
              <h3 className="text-lg font-black text-slate-900">{tM("title")}</h3>
              <p className="text-xs font-semibold text-[#6c4cff]">{shelfName}</p>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-end">
            <div className="flex rounded-2xl bg-[#f6f8fc] p-1 ring-1 ring-[#e7ecf5]">
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`flex-1 rounded-xl py-2 text-xs font-black transition ${
                  mode === "existing"
                    ? "bg-white text-[#6c4cff] shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tM("modeExisting")}
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-xs font-black transition ${
                  mode === "new"
                    ? "bg-white text-[#6c4cff] shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {tM("modeNew")}
              </button>
            </div>

            {mode === "existing" ? (
              <>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">{tM("search")}</span>
                  <div className="relative mt-1">
                    <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 ltr:left-3 rtl:right-3" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-[#e7ecf5] bg-[#f6f8fc] px-3 text-sm font-semibold ltr:pl-9 ltr:pr-3 rtl:pl-3 rtl:pr-9"
                      placeholder={tM("searchPlaceholder")}
                    />
                  </div>
                </label>

                {searching ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-[#6c4cff]" />
                  </div>
                ) : results.length > 0 ? (
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-2xl border border-[#e7ecf5] p-1">
                    {results.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => setProductId(row.id)}
                          className={`flex w-full flex-col rounded-xl px-3 py-2 text-start transition ${
                            productId === row.id
                              ? "bg-[#6c4cff]/10 ring-1 ring-[#6c4cff]/30"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="font-black text-slate-900">{row.name}</span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {row.location || tM("noLocation")}
                            {row.latestQuantity != null ? ` · ${row.latestQuantity}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : q.trim() ? (
                  <div className="rounded-2xl border border-dashed border-[#e7ecf5] bg-[#f6f8fc]/80 p-3 text-center">
                    <p className="text-xs font-semibold text-slate-500">{tM("noResults")}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("new");
                        setNewName(q.trim());
                        setProductId("");
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-black text-[#6c4cff] hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {tM("createFromSearch", { name: q.trim() })}
                    </button>
                  </div>
                ) : null}

                {selected ? (
                  <p className="text-xs font-bold text-emerald-700">
                    {tM("selected", { name: selected.name })}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">{tM("newName")}</span>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 h-11 w-full rounded-2xl border border-[#e7ecf5] px-3 text-sm font-semibold"
                    placeholder={tM("newNamePlaceholder")}
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">{tM("newUnit")}</span>
                  <input
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="mt-1 h-11 w-full rounded-2xl border border-[#e7ecf5] px-3 text-sm font-semibold"
                    placeholder={tM("newUnitPlaceholder")}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">{tM("newMinimum")}</span>
                  <input
                    type="number"
                    value={newMinimum}
                    onChange={(e) => setNewMinimum(e.target.value)}
                    className="mt-1 h-11 w-full rounded-2xl border border-[#e7ecf5] px-3 text-sm font-semibold"
                    min={0}
                  />
                </label>
              </>
            )}

            <label className="block">
              <span className="text-xs font-bold text-slate-600">{tM("quantity")}</span>
              <input
                type="number"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 h-11 w-full rounded-2xl border border-[#e7ecf5] px-3 text-sm font-semibold"
                placeholder="0"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">{tM("slotNote")}</span>
              <input
                value={slotNote}
                onChange={(e) => setSlotNote(e.target.value)}
                className="mt-1 h-11 w-full rounded-2xl border border-[#e7ecf5] px-3 text-sm font-semibold"
                placeholder={tM("slotOptional")}
              />
            </label>

            {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}
          </div>

          <footer className="flex flex-wrap gap-2 border-t border-[#e7ecf5] p-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-11 flex-1 rounded-2xl border border-[#e7ecf5] text-sm font-black text-slate-700 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ continueAfter: true })}
              className="h-11 flex-1 rounded-2xl border border-[#6c4cff]/30 bg-[#6c4cff]/8 text-sm font-black text-[#6c4cff] disabled:opacity-50"
            >
              {busy ? "…" : tM("saveContinue")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({})}
              className="h-11 min-w-[7rem] flex-[1.2] rounded-2xl text-sm font-black text-white disabled:opacity-50"
              style={{ background: "#16c784" }}
            >
              {busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : tM("save")}
            </button>
          </footer>
        </div>
      </div>

      {existsPrompt ? (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" dir={dir}>
            <h4 className="text-base font-black text-slate-900">{tM("existsTitle")}</h4>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {tM("existsBody", { name: existsPrompt.name })}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-[#e7ecf5] py-2.5 text-sm font-black"
                onClick={() => setExistsPrompt(null)}
              >
                {tM("existsNo")}
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-[#6c4cff] py-2.5 text-sm font-black text-white"
                onClick={() => {
                  setExistsPrompt(null);
                  void save({ increaseIfExists: true, continueAfter: true });
                }}
              >
                {tM("existsYes")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
