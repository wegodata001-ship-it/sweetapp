"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Banknote,
  CalendarClock,
  ClipboardList,
  Clock,
  Info,
  Megaphone,
  UserX,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import {
  useNotificationsInbox,
  type NotifItem,
} from "@/components/notifications-provider";
import { priorityToColor } from "@/lib/notifications/priority";

const SECTION_ORDER = ["employees", "tasks", "finance", "inventory", "orders", "other"] as const;

type SectionKey = (typeof SECTION_ORDER)[number];

const API_READ = "/api/me/notifications";

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

function iconForType(type: string): LucideIcon {
  switch (type) {
    case "TASK_ASSIGNED":
    case "TASK_COMPLETED":
    case "TASK_LATE":
    case "TASK_OVERDUE":
    case "TASK_STARTED":
      return ClipboardList;
    case "SHIFT_LATE":
    case "CLOCK_IN_LATE":
    case "MISSED_CLOCK_IN":
      return UserX;
    case "CHECK_DEPOSIT":
    case "CHECK_DUE":
    case "CHECK_DEPOSITED":
      return Banknote;
    case "FUTURE_ORDER":
    case "NEW_ORDER":
      return CalendarClock;
    case "NEW_UPDATE":
      return Megaphone;
    case "OVERTIME":
      return Clock;
    default:
      return Info;
  }
}

function actionLabel(type: string, actionUrl: string | null | undefined, t: (k: string) => string): string {
  if (type === "SHIFT_LATE") return t("alerts.actionAddReason");
  if (actionUrl?.startsWith("tel:")) return t("alerts.actionContact");
  if (actionUrl) return t("alerts.actionOpen");
  return "";
}

function NotificationCard({
  item,
  onMarkRead,
  t,
  bcp47,
}: {
  item: NotifItem;
  onMarkRead: (id: string) => void;
  t: (k: string) => string;
  bcp47: string;
}) {
  const Icon = iconForType(item.type);
  const borderColor = item.color ?? priorityToColor(item.priority ?? "MEDIUM");
  const action = actionLabel(item.type, item.actionUrl, t);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`cursor-pointer rounded-xl border-s-4 bg-white px-3 py-2.5 transition hover:bg-slate-50 ${
        !item.isRead ? "bg-amber-50/40 ring-1 ring-amber-100" : ""
      }`}
      style={{ borderInlineStartColor: borderColor, borderInlineStartWidth: 4 }}
      onClick={() => {
        if (!item.isRead) onMarkRead(item.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!item.isRead) onMarkRead(item.id);
        }
      }}
    >
      <div className="flex gap-2.5">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${borderColor}22`, color: borderColor }}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-slate-900">{item.title}</p>
            {!item.isRead ? (
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
            ) : null}
          </div>
          {item.message ? (
            <p className="mt-0.5 text-xs leading-snug text-slate-600">{item.message}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-slate-400">
            {new Date(item.createdAt).toLocaleString(bcp47, {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {item.actionUrl && action ? (
            <Link
              href={item.actionUrl}
              className="mt-2 inline-flex min-h-[36px] items-center rounded-lg bg-slate-900 px-3 text-xs font-bold text-white"
              onClick={(e) => {
                e.stopPropagation();
                if (!item.isRead) onMarkRead(item.id);
              }}
            >
              {action}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function StaffAlertsBell() {
  const { t, bcp47 } = useI18n();
  const { unread, items, inbox, refresh, applyLocalRead, setAllReadLocally } =
    useNotificationsInbox();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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
    applyLocalRead(ids);
    await fetch(API_READ, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    void refresh({ force: true });
  }

  async function markAll() {
    setAllReadLocally();
    await fetch(API_READ, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    void refresh({ force: true });
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

  const cardList = (list: NotifItem[]) => (
    <div className="flex flex-col gap-2 px-2 py-1">
      {list.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-slate-500">{t("alerts.empty")}</p>
      ) : (
        list.map((a) => (
          <NotificationCard
            key={a.id}
            item={a}
            t={t}
            bcp47={bcp47}
            onMarkRead={(id) => void markRead([id])}
          />
        ))
      )}
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
            <div className="flex flex-col gap-2 px-2 py-2">
              {secItems.map((a) => (
                <NotificationCard
                  key={a.id}
                  item={a}
                  t={t}
                  bcp47={bcp47}
                  onMarkRead={(id) => void markRead([id])}
                />
              ))}
            </div>
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
      <div className={scrollAreaClass}>
        {inbox === "employee" ? cardList(items) : adminGrouped}
      </div>
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
              inbox === "employee" ? "w-[min(100vw-2rem,340px)]" : "w-[min(100vw-2rem,440px)]"
            }`}
          >
            {listSection}
          </div>
        </>
      ) : null}
    </div>
  );
}
