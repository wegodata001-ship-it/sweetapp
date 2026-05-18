import { redirect } from "next/navigation";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { hasActiveWorkSession } from "@/lib/work-sessions/access";
import { ClockInScreen } from "./clock-screen";

/**
 * The "front door" for employees — shown when there is NO active work session.
 * Admins and super-admins are bounced back to the root dashboard since this
 * gate is not meant for them.
 */
export default async function ClockGatePage() {
  const session = await getSessionFromCookie();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "EMPLOYEE") {
    redirect("/");
  }
  if (await hasActiveWorkSession(session.sub)) {
    redirect("/employee");
  }
  return <ClockInScreen />;
}
