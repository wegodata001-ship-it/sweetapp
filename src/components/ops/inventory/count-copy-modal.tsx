"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCopy, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import {
  formatAllCountSessionsCopyText,
  formatCopyCountDate,
  formatCountSessionCopyText,
  type CountCopySession,
} from "@/lib/inventory/count-copy-service";
import { localYmd } from "@/components/ops/inventory-count/utils";

type LocationOption = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** מיקומים פעילים לבחירה */
  locations: LocationOption[];
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return localYmd(d);
}

export function CountCopyModal({ open, onClose, locations }: Props) {
  const { t, dir, locale } = useI18n();
  const { showToast } = useToast();
  const tC = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      t(`ops.inventory.warehouse.copyCounts.${key}`, vars),
    [t],
  );

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => localYmd(new Date()));
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CountCopySession[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFrom(defaultFrom());
    setTo(localYmd(new Date()));
    setLocationId("");
    setSessions(null);
    setError(null);
    setCopiedId(null);
  }, [open]);

  const sortedLocations = useMemo(
    () => [...locations].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [locations],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessions(null);
    try {
      const qs = new URLSearchParams({ from, to });
      if (locationId) qs.set("locationId", locationId);
      const res = await fetch(`/api/inventory/count-copy?${qs.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { sessions?: CountCopySession[] };
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? tC("loadFailed"));
        return;
      }
      setSessions(j.data?.sessions ?? []);
    } catch {
      setError(tC("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [from, to, locationId, tC]);

  const flashCopied = (id: string) => {
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
  };

  const handleCopySession = async (session: CountCopySession) => {
    const text = formatCountSessionCopyText(session, locale);
    const ok = await copyToClipboard(text);
    if (ok) {
      flashCopied(session.id);
      showToast({ tone: "success", title: tC("copiedOne"), durationMs: 2000 });
    } else {
      showToast({ tone: "error", title: tC("copyFailed"), durationMs: 3000 });
    }
  };

  const handleCopyAll = async () => {
    if (!sessions || sessions.length === 0) return;
    const text = formatAllCountSessionsCopyText(sessions, locale);
    const ok = await copyToClipboard(text);
    if (ok) {
      flashCopied("__all__");
      showToast({ tone: "success", title: tC("copiedAll"), durationMs: 2500 });
    } else {
      showToast({ tone: "error", title: tC("copyFailed"), durationMs: 3000 });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[24px]"
        dir={dir}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="count-copy-title"
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e7ecf5] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label={tC("close")}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-end">
            <h2 id="count-copy-title" className="truncate text-base font-black text-slate-900">
              {tC("title")}
            </h2>
            <p className="text-[11px] font-semibold text-slate-500">{tC("hint")}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-end">
              <span className="mb-1 block text-[11px] font-bold text-slate-500">{tC("from")}</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-12 w-full touch-manipulation rounded-2xl border border-[#e7ecf5] bg-[#f6f8fc] px-2 text-sm font-bold outline-none focus:border-[#6c4cff]"
              />
            </label>
            <label className="block text-end">
              <span className="mb-1 block text-[11px] font-bold text-slate-500">{tC("to")}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-12 w-full touch-manipulation rounded-2xl border border-[#e7ecf5] bg-[#f6f8fc] px-2 text-sm font-bold outline-none focus:border-[#6c4cff]"
              />
            </label>
          </div>

          <label className="mt-2 block text-end">
            <span className="mb-1 block text-[11px] font-bold text-slate-500">
              {tC("location")}
            </span>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="h-12 w-full touch-manipulation rounded-2xl border border-[#e7ecf5] bg-[#f6f8fc] px-3 text-sm font-bold outline-none focus:border-[#6c4cff]"
            >
              <option value="">{tC("allLocations")}</option>
              {sortedLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !from || !to}
            className="mt-3 flex h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl bg-[#6c4cff] text-sm font-black text-white shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {tC("show")}
          </button>

          {error ? (
            <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-center text-xs font-black text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          ) : null}

          {sessions && sessions.length === 0 ? (
            <p className="mt-4 text-center text-sm font-semibold text-slate-500">{tC("empty")}</p>
          ) : null}

          {sessions && sessions.length > 0 ? (
            <div className="mt-4 space-y-3">
              <p className="text-center text-[11px] font-bold text-slate-500">
                {tC("found", { n: sessions.length })}
              </p>
              {sessions.map((session) => {
                const preview = formatCountSessionCopyText(session, locale);
                return (
                  <article
                    key={session.id}
                    className="overflow-hidden rounded-2xl border border-[#e7ecf5] bg-slate-50/80"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-[#e7ecf5] bg-white px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void handleCopySession(session)}
                        className="inline-flex h-10 touch-manipulation items-center gap-1.5 rounded-xl border border-[#e7ecf5] bg-white px-3 text-[11px] font-black text-[#6c4cff]"
                      >
                        {copiedId === session.id ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <ClipboardCopy className="h-3.5 w-3.5" />
                        )}
                        {copiedId === session.id ? tC("copied") : tC("copyOne")}
                      </button>
                      <div className="min-w-0 flex-1 text-end">
                        <p className="truncate text-sm font-black text-slate-900">
                          {session.locationName}
                        </p>
                        <p className="text-[11px] font-bold text-slate-500">
                          {formatCopyCountDate(session.countDate)} · #{session.sessionNumber}
                        </p>
                      </div>
                    </div>
                    <pre
                      className="max-h-56 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-[12px] font-semibold leading-relaxed text-slate-800"
                      dir="auto"
                    >
                      {preview}
                    </pre>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-[#e7ecf5] bg-white px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void handleCopyAll()}
            disabled={!sessions || sessions.length === 0}
            className="flex h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl bg-[#6c4cff] text-base font-black text-white shadow-md disabled:opacity-40"
          >
            {copiedId === "__all__" ? (
              <Check className="h-5 w-5" />
            ) : (
              <ClipboardCopy className="h-5 w-5" />
            )}
            {tC("copyAll")}
          </button>
        </footer>
      </div>
    </div>
  );
}
