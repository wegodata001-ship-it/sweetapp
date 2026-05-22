import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-1 pb-8 pt-2 sm:px-2">
      <DashboardShell />
    </div>
  );
}
