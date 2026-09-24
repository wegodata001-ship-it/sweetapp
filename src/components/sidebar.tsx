"use client";

import { AppNavContent } from "@/components/app-nav-content";
import { SidebarBrand } from "@/components/brand/sidebar-brand";

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen min-h-0 w-[78px] shrink-0 flex-col border-l border-white/10 bg-[#081224] shadow-luxury lg:flex lg:w-72">
      <div className="shrink-0 px-2 pt-3 lg:px-4 lg:pt-3">
        <SidebarBrand />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-3 pt-2 [-webkit-overflow-scrolling:touch] lg:px-4 lg:pt-2">
        <AppNavContent variant="sidebar" />
      </div>
    </aside>
  );
}
