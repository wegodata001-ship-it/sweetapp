import { redirect } from "next/navigation";

/**
 * The legacy single-row-per-day attendance UI has been superseded by the
 * new multi-cycle WorkSession-based "Hours" page. We keep the URL alive but
 * always send callers to the new one so older bookmarks and the existing
 * middleware redirects (e.g. `/ops/attendance` → `/employee/attendance`)
 * continue to work without dead-ends.
 */
export default function LegacyAttendancePage() {
  redirect("/employee/hours");
}
