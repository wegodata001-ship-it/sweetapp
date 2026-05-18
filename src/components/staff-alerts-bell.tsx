"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

type InboxKind = "employee" | "admin";

type NotifItem = {
  id: string;
  type: string;
  section: string;
  title: string;
  message: string;
  color: string | null;
  isRead: boolean;
  createdAt: string;
};

const SECTION_ORDER = ["employees", "tasks", "finance", "inventory", "orders", "other"] as const;

type SectionKey = (typeof SECTION_ORDER)[number];

function sectionTKey(section: string): string {
  switch (section) {
    case "employees":
      return "alerts.sectionEmployees";
    case "tasks":
      return "alerts.sectionTasks";
    case "finance":
      return "alerts.sectionFinance";
    case "inventory":
      return "alerts.sectionInventory";
    case "orders":
      return "alerts.sectionOrders";
    default:
      return "alerts.sectionOther";
  }
}

export function StaffAlertsBell() {
  const { t, bcp47 } = useI18n();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [inbox, setInbox] = useState<InboxKind>("employee");
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notifications", { credentials: "same-origin", cache: "no-store" });
      const j = (await res.json()) as {
        ok?: boolean;
        data?: { unreadCount: number; items: NotifItem[]; inbox: InboxKind };
      };
      if (!j.ok || !j.data) return;
      setUnread(j.data.unreadCount);
      setItems(j.data.items);
      setInbox(j.data.inbox);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    await fetch("/api/me/notifications", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    void load();
  }

  async function markAll() {
    await fetch("/api/me/notifications", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    void load();
  }

  const grouped = useMemo(() => {
    const map = new Map<string, NotifItem[]>();
    for (const s of SECTION_ORDER) map.set(s, []);
    for (const it of items) {
      const sec = SECTION_ORDER.includes(it.section as SectionKey) ? it.section : "other";
      map.get(sec)!.push(it);
    }
    return SECTION_ORDER.map((s) => ({ section: s, items: map.get(s)! })).filter((x) => x.items.length > 0);
  }, [items]);

  const scrollAreaClass =
    inbox === "employee"
      ? "max-h-[min(52dvh,340px)] overflow-y-auto overscroll-y-contain lg:max-h-[300px]"
      : "max-h-[min(72dvh,520px)] overflow-y-auto overscroll-y-contain lg:max-h-[400px]";

  const employeeTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-start text-xs font-bold text-slate-500">
            <th className="px-3 py-2 font-bold">{t("alerts.alertLabel")}</th>
            <th className="w-[1%] whitespace-nowrap px-3 py-2 font-bold">{t("alerts.time")}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-3 py-6 text-center text-slate-500">
                {t("alerts.empty")}
              </td>
            </tr>
          ) : (
            items.map((a) => (
              <tr
                key={a.id}
                className={`cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 ${
                  !a.isRead ? "bg-amber-50/40" : ""
                }`}
                onClick={() => {
                  if (!a.isRead) void markRead([a.id]);
                }}
              >
                <td className="px-3 py-2.5">
                  <span
                    className="me-2 inline-block h-2 w-2 shrink-0 rounded-full align-middle"
                    style={{ backgroundColor: a.color ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <span className="align-middle font-semibold text-slate-900">{a.title}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500" dir="ltr">
                  {new Date(a.createdAt).toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit" })}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const adminGrouped = (
    <>
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-slate-500">{t("alerts.empty")}</p>
      ) : (
        grouped.map(({ section, items: secItems }) => (
          <div key={section} className="border-b border-slate-100 last:border-b-0">
            <p className="bg-slate-50 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-slate-600">
              {t(sectionTKey(section))}
            </p>
            {secItems.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`block w-full min-h-[44px] border-b border-slate-50 px-3 py-2.5 text-start text-sm transition hover:bg-slate-50 ${
                  !a.isRead ? "bg-amber-50/35" : ""
                }`}
                onClick={() => {
                  if (!a.isRead) void markRead([a.id]);
                }}
              >
                <div className="flex gap-2">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: a.color ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{a.title}</p>
                    {a.message ? (
                      <p className="mt-0.5 text-xs leading-snug text-slate-600">{a.message}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-400">{new Date(a.createdAt).toLocaleString(bcp47)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))
      )}
    </>
  );

  const listSection = (
    <>
      <div className="flex items-center justify-between border-b border-slate-100 px-3 pb-2 pt-1">
        <p className="text-sm font-black text-slate-800">{t("alerts.title")}</p>
        {unread > 0 ? (
          <button
            type="button"
            className="min-h-[44px] px-2 text-xs font-bold text-luxury-gold underline"
            onClick={() => void markAll()}
          >
            {t("alerts.markAllRead")}
          </button>
        ) : null}
      </div>
      <div className={scrollAreaClass}>{inbox === "employee" ? employeeTable : adminGrouped}</div>
    </>
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`relative inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 ${
          inbox === "employee"
            ? "h-9 min-h-[40px] w-9 min-w-[40px] text-slate-600"
            : "h-11 min-h-[44px] w-11 min-w-[44px]"
        }`}
        aria-label={t("alerts.bellAria")}
        aria-expanded={open}
      >
        <Bell className={inbox === "employee" ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
        {unread > 0 ? (
          <span
            className={`absolute end-0 top-0 flex min-w-[16px] translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white ${
              inbox === "employee" ? "h-[15px]" : "h-[18px]"
            }`}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[195] cursor-default bg-black/45 lg:hidden"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
          />
          <div
            className={`fixed inset-x-0 bottom-0 z-[200] flex flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl lg:hidden ${
              inbox === "employee" ? "max-h-[min(58dvh,400px)]" : "max-h-[min(78dvh,560px)]"
            }`}
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
            role="dialog"
            aria-modal="true"
          >
            {listSection}
          </div>
          <div
            className={`absolute end-0 z-[100] mt-2 hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-xl lg:block ${
              inbox === "employee" ? "w-[min(100vw-2rem,300px)]" : "w-[min(100vw-2rem,420px)]"
            }`}
          >
            {listSection}
          </div>
        </>
      ) : null}
    </div>
  );
}
