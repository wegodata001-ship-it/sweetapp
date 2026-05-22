import { WorkStatusEmployeeView } from "@/components/work-status/work-status-employee-view";
import { requireActiveWorkSession } from "@/lib/work-sessions/access";

export default async function EmployeeWorkStatusPage() {
  await requireActiveWorkSession();
  return (
    <div className="mx-auto max-w-lg px-3 py-4 sm:px-4 sm:py-6">
      <WorkStatusEmployeeView />
    </div>
  );
}
