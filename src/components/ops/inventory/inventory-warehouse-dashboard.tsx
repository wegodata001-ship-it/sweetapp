"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import type { ShelfSummary } from "@/components/ops/inventory-count/types";
import { localYmd } from "@/components/ops/inventory-count/utils";
import { AddShelfModal } from "./add-shelf-modal";
import { ShelfAddProductsModal } from "./shelf-add-products-modal";
import { ShelfCountModal } from "./shelf-count-modal";
import { ShelfDeleteConfirmModal } from "./shelf-delete-confirm-modal";
import type { ShelfCardMenuAction } from "./shelf-card-actions-menu";
import {
  formatCountElapsed,
  shelfCountTargetMinutes,
  type ShelfCountSession,
} from "@/lib/inventory/shelf-count-session";
import {
  resolveShelfVisualStatus,
  ShelfGridCard,
  type ShelfGridModel,
} from "./shelf-grid-card";

type LocationRow = { id: string; name: string; description: string | null };

function canManageInventory(user: { role: string; permissions: string[] } | null) {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return true;
  return user.permissions.includes("inventory");
}

export function InventoryWarehouseDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t, dir } = useI18n();
  const tW = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.warehouse.${key}`, vars);
  const tCard = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.warehouse.card.${key}`, vars);

  const canManage = canManageInventory(user);

  const [shelfSummaries, setShelfSummaries] = useState<ShelfSummary[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [modalShelf, setModalShelf] = useState<string | null>(null);
  const [addShelfOpen, setAddShelfOpen] = useState(false);
  const [search, setSearch] = useState("");
  const countDate = localYmd(new Date());

  const [actionShelf, setActionShelf] = useState<ShelfGridModel | null>(null);
  const [addProductsOpen, setAddProductsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busyShelfName, setBusyShelfName] = useState<string | null>(null);
  const [exitingNames, setExitingNames] = useState<Set<string>>(new Set());
  const [enteringNames, setEnteringNames] = useState<Set<string>>(new Set());
  const [countSessions, setCountSessions] = useState<Record<string, ShelfCountSession>>({});
  const [, setTick] = useState(0);

  const loadShelves = useCallback(async () => {
    const res = await fetch("/api/inventory/shelf-summaries", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: ShelfSummary[] };
    setShelfSummaries(j.data ?? []);
  }, []);

  const loadLocations = useCallback(async () => {
    const res = await fetch("/api/inventory/locations", { credentials: "same-origin" });
    const j = (await res.json()) as { data?: LocationRow[] };
    setLocations(j.data ?? []);
  }, []);

  useEffect(() => {
    void Promise.all([loadShelves(), loadLocations()]);
  }, [loadShelves, loadLocations]);

  useEffect(() => {
    if (!modalShelf) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [modalShelf]);

  const openShelfCount = useCallback((shelf: ShelfGridModel) => {
    setCountSessions((prev) => ({
      ...prev,
      [shelf.name]: {
        startedAt: prev[shelf.name]?.startedAt ?? new Date().toISOString(),
        targetMinutes: shelfCountTargetMinutes(shelf.productCount),
      },
    }));
    setModalShelf(shelf.name);
  }, []);

  const closeShelfCount = useCallback(() => {
    setModalShelf((name) => {
      if (name) {
        setCountSessions((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
      return null;
    });
  }, []);

  const locationByName = useMemo(() => {
    const m = new Map<string, LocationRow>();
    for (const l of locations) m.set(l.name.trim(), l);
    return m;
  }, [locations]);

  const shelves: ShelfGridModel[] = useMemo(() => {
    const map = new Map<string, ShelfGridModel>();
    for (const loc of locations) {
      const name = loc.name.trim();
      map.set(name, {
        name,
        productCount: 0,
        shortageCount: 0,
        surplusCount: 0,
        matchPct: 100,
        visualStatus: "perfect",
        locationId: loc.id,
      });
    }
    for (const s of shelfSummaries) {
      const name = s.name.trim();
      const base = {
        name,
        productCount: s.productCount,
        shortageCount: s.shortageCount,
        surplusCount: s.surplusCount ?? 0,
        matchPct: s.matchPct ?? 0,
      };
      map.set(name, {
        ...base,
        visualStatus: resolveShelfVisualStatus(base),
        locationId: map.get(name)?.locationId ?? locationByName.get(name)?.id ?? null,
      });
    }
    const q = search.trim().toLowerCase();
    return [...map.values()]
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .filter((s) => !exitingNames.has(s.name))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [locations, shelfSummaries, search, locationByName, exitingNames]);

  const upsertSummary = useCallback((summary: ShelfSummary) => {
    setShelfSummaries((prev) => {
      const next = prev.filter((s) => s.name.trim() !== summary.name.trim());
      next.push(summary);
      return next.sort((a, b) => a.name.localeCompare(b.name, "he"));
    });
  }, []);

  const handleMenuAction = (shelf: ShelfGridModel, action: ShelfCardMenuAction) => {
    if (!canManage) return;
    setActionShelf(shelf);
    if (action === "addProducts") setAddProductsOpen(true);
    if (action === "delete") setDeleteOpen(true);
    if (action === "duplicate") void duplicateShelf(shelf);
  };

  const shelfApiPath = (shelf: ShelfGridModel) =>
    shelf.locationId ? shelf.locationId : "by-name";

  const duplicateShelf = async (shelf: ShelfGridModel) => {
    if (busyShelfName) return;
    setBusyShelfName(shelf.name);
    try {
      const res = await fetch(`/api/inventory/shelves/${shelfApiPath(shelf)}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ shelfName: shelf.name }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: {
          shelf: { id: string; name: string; description: string | null };
          summary: ShelfSummary;
          sourceSummary?: ShelfSummary;
        };
      };
      if (!res.ok || !j.ok || !j.data?.summary) {
        showToast({ tone: "error", title: j.error ?? tW("toast.duplicateFailed"), durationMs: 3000 });
        return;
      }

      setLocations((prev) => {
        if (prev.some((l) => l.id === j.data!.shelf.id)) return prev;
        return [
          ...prev,
          {
            id: j.data!.shelf.id,
            name: j.data!.shelf.name,
            description: j.data!.shelf.description,
          },
        ].sort((a, b) => a.name.localeCompare(b.name, "he"));
      });

      if (j.data.sourceSummary) upsertSummary(j.data.sourceSummary);
      upsertSummary(j.data.summary);

      setEnteringNames((prev) => new Set(prev).add(j.data!.summary.name));
      setTimeout(() => {
        setEnteringNames((prev) => {
          const n = new Set(prev);
          n.delete(j.data!.summary.name);
          return n;
        });
      }, 400);

      showToast({ tone: "success", title: tW("toast.duplicated"), durationMs: 2500 });
    } catch {
      showToast({ tone: "error", title: tW("toast.duplicateFailed"), durationMs: 3000 });
    } finally {
      setBusyShelfName(null);
    }
  };

  const confirmDeleteShelf = async () => {
    if (!actionShelf || busyShelfName) return;
    const name = actionShelf.name;
    setBusyShelfName(name);
    try {
      const res = await fetch(
        `/api/inventory/shelves/${shelfApiPath(actionShelf)}?name=${encodeURIComponent(name)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        showToast({ tone: "error", title: j.error ?? tW("toast.deleteFailed"), durationMs: 3000 });
        return;
      }

      setDeleteOpen(false);
      setExitingNames((prev) => new Set(prev).add(name));
      setTimeout(() => {
        setShelfSummaries((prev) => prev.filter((s) => s.name.trim() !== name.trim()));
        setLocations((prev) => prev.filter((l) => l.name.trim() !== name.trim()));
        setExitingNames((prev) => {
          const n = new Set(prev);
          n.delete(name);
          return n;
        });
      }, 320);

      showToast({ tone: "success", title: tW("toast.deleted"), durationMs: 2500 });
    } catch {
      showToast({ tone: "error", title: tW("toast.deleteFailed"), durationMs: 3000 });
    } finally {
      setBusyShelfName(null);
      setActionShelf(null);
    }
  };

  return (
    <div className="space-y-5" dir={dir}>
      <style>{`
        @keyframes shelf-enter {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{t("ops.inventory.title")}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">{tW("pageHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tW("searchShelf")}
            className="h-10 min-w-[12rem] rounded-2xl border border-[#e7ecf5] bg-white px-3 text-sm font-semibold outline-none focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/15"
          />
          <button
            type="button"
            onClick={() => setAddShelfOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-black text-white shadow-md transition hover:brightness-110"
            style={{ background: "#6c4cff" }}
          >
            <Plus className="h-4 w-4" />
            {tW("addShelf")}
          </button>
        </div>
      </header>

      {shelves.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[#e7ecf5] bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-600">{tW("noShelves")}</p>
          <Link
            href="/ops/inventory/locations"
            className="mt-2 inline-block text-sm font-black text-[#6c4cff] underline"
          >
            {t("ops.inventory.manageAreasLink")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shelves.map((shelf) => {
            const session = countSessions[shelf.name];
            const isCounting = modalShelf === shelf.name;
            const elapsed =
              session && isCounting
                ? formatCountElapsed(Date.now() - new Date(session.startedAt).getTime())
                : "00:00";
            return (
              <ShelfGridCard
                key={shelf.name}
                shelf={shelf}
                t={tCard}
                onOpen={() => {
                  if (isCounting) closeShelfCount();
                  else openShelfCount(shelf);
                }}
                onMenuAction={(action) => handleMenuAction(shelf, action)}
                busy={busyShelfName === shelf.name}
                entering={enteringNames.has(shelf.name)}
                canManage={canManage}
                noPermissionTitle={tCard("noPermission")}
                isCounting={isCounting}
                elapsedLabel={elapsed}
                targetMinutes={
                  session?.targetMinutes ?? shelfCountTargetMinutes(shelf.productCount)
                }
                countProgressPct={shelf.matchPct}
              />
            );
          })}
        </div>
      )}

      <ShelfCountModal
        open={modalShelf !== null}
        shelfName={modalShelf ?? ""}
        countDate={countDate}
        onClose={closeShelfCount}
        onShelfStatsChange={loadShelves}
        t={(k, v) => t(`ops.inventory.warehouse.modal.${k}`, v)}
      />

      <ShelfAddProductsModal
        open={addProductsOpen && actionShelf !== null}
        shelfName={actionShelf?.name ?? ""}
        locationId={actionShelf?.locationId ?? null}
        countDate={countDate}
        onClose={() => {
          setAddProductsOpen(false);
          setActionShelf(null);
        }}
        onShelfUpdated={(summary) => upsertSummary(summary)}
      />

      <ShelfDeleteConfirmModal
        open={deleteOpen && actionShelf !== null}
        shelfName={actionShelf?.name ?? ""}
        busy={busyShelfName === actionShelf?.name}
        onCancel={() => {
          if (busyShelfName) return;
          setDeleteOpen(false);
          setActionShelf(null);
        }}
        onConfirm={() => void confirmDeleteShelf()}
      />

      <AddShelfModal
        open={addShelfOpen}
        onClose={() => setAddShelfOpen(false)}
        onCreated={(loc) => {
          setLocations((prev) =>
            [...prev, { id: loc.id, name: loc.name, description: loc.description }].sort((a, b) =>
              a.name.localeCompare(b.name, "he"),
            ),
          );
          setShelfSummaries((prev) => {
            if (prev.some((s) => s.name.trim() === loc.name.trim())) return prev;
            return [
              ...prev,
              {
                name: loc.name,
                productCount: 0,
                shortageCount: 0,
                surplusCount: 0,
                okCount: 0,
                matchPct: 100,
              },
            ].sort((a, b) => a.name.localeCompare(b.name, "he"));
          });
        }}
        t={(k) => t(`ops.inventory.warehouse.addShelf.${k}`)}
      />
    </div>
  );
}
