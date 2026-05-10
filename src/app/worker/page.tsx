import { redirect } from "next/navigation";

export default function WorkerPortalRedirectPage() {
  redirect("/worker/tasks");
}
