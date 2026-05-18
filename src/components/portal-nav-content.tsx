"use client";

import { CheckSquare, Clock3, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";

type Props = {
  onNavigate?: () => void;
};

/** ניווט מצומצם לפורטל עובד / worker */
export function PortalNavContent({ onNavigate }: Props) {
  const pathname = usePathname();
  const { t } = useI18n();
  const worker = pathname.startsWith("/worker");

  const linkClass = (active: boolean) =>
    `flex min-h-[52px] items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-bold transition ${
      active
        ? "bg-luxury-gold/20 text-luxury-gold"
        : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
    }`;

  return (
    <nav className="space-y-1 px-3 pb-8 pt-2">
      <Link
        href="/"
        onClick={onNavigate}
        className={linkClass(pathname === "/")}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
          <LayoutDashboard className="h-5 w-5" aria-hidden />
        </span>
        {t("nav.home")}
      </Link>
      {worker ? (
        <Link
          href="/worker/tasks"
          onClick={onNavigate}
          className={linkClass(pathname.startsWith("/worker/tasks"))}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <CheckSquare className="h-5 w-5" aria-hidden />
          </span>
          {t("mobileNav.workerTasks")}
        </Link>
      ) : (
        <>
          <Link
            href="/employee/tasks"
            onClick={onNavigate}
            className={linkClass(pathname.startsWith("/employee/tasks"))}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <CheckSquare className="h-5 w-5" aria-hidden />
            </span>
            {t("nav.myTasks")}
          </Link>
          <Link
            href="/employee/attendance"
            onClick={onNavigate}
            className={linkClass(pathname.startsWith("/employee/attendance"))}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <Clock3 className="h-5 w-5" aria-hidden />
            </span>
            {t("nav.myAttendance")}
          </Link>
        </>
      )}
    </nav>
  );
}
