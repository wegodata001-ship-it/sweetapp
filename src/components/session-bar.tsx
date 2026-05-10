"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function SessionBar() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  if (pathname === "/login" || loading || !user) {
    return null;
  }

  const roleLabel = user.role === "SUPER_ADMIN" ? "SUPER ADMIN" : "EMPLOYEE";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-sm text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          שלום <strong className="font-bold text-slate-900">{user.fullName}</strong>
        </span>
        <span className="rounded-full bg-luxury-navy-rich px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-luxury-gold">
          {roleLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-800"
      >
        יציאה
      </button>
    </div>
  );
}
