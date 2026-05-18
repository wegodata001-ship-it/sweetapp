import { redirect } from "next/navigation";

/** Canonical URL used after forced password change — forwards to employee home. */
export default function EmployeeDashboardAliasPage() {
  redirect("/employee");
}
