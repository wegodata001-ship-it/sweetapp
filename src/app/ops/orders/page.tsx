"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OrdersHub } from "@/components/orders/orders-hub";
import { WeddingOrdersHub } from "@/components/orders/wedding-orders-hub";
import { OpsTabBar, type OpsTab } from "@/components/ops/ops-tab-bar";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";

function OrdersPageInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const params = useSearchParams();
  const [todayCount, setTodayCount] = useState<number | undefined>();
  const [futureCount, setFutureCount] = useState<number | undefined>();

  const perms = user?.permissions ?? [];
  const canDaily =
    user?.role === "SUPER_ADMIN" ||
    user?.role === "ADMIN" ||
    perms.includes("tasks") ||
    perms.includes("employee_clock");
  const canFuture =
    user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || perms.includes("wedding_orders");

  const tabs: OpsTab[] = [];
  if (canDaily) tabs.push({ id: "today", label: t("ops.orders.tabToday"), href: "/ops/orders?tab=today", count: todayCount });
  if (canFuture) tabs.push({ id: "future", label: t("ops.orders.tabFuture"), href: "/ops/orders?tab=future", count: futureCount });

  const requested = params.get("tab");
  const active = tabs.some((tab) => tab.id === requested) ? requested! : (tabs[0]?.id ?? "today");

  useEffect(() => {
    if (!canDaily && !canFuture) return;
    let cancelled = false;
    const load = async (category: string) => {
      const res = await fetch(`/api/future-orders?category=${category}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; data?: unknown[] };
      return json.ok && Array.isArray(json.data) ? json.data.length : undefined;
    };
    void Promise.all([load("daily"), canFuture ? load("wedding") : Promise.resolve(undefined)])
      .then(([daily, wedding]) => {
        if (cancelled) return;
        if (typeof daily === "number") setTodayCount(daily);
        if (typeof wedding === "number") setFutureCount(wedding);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canDaily, canFuture]);

  if (!tabs.length) {
    return <p className="p-6 text-sm font-semibold text-slate-600">{t("ops.orders.noAccess")}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 p-3 sm:p-5">
      <header>
        <h1 className="text-2xl font-black text-slate-950">{t("ops.orders.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("ops.orders.subtitle")}</p>
      </header>
      <OpsTabBar tabs={tabs} active={active} />
      {active === "today" && canDaily ? <OrdersHub module="daily" canManage /> : null}
      {active === "future" && canFuture ? <WeddingOrdersHub /> : null}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageInner />
    </Suspense>
  );
}
