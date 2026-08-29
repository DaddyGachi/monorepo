import { redirect } from "next/navigation";

export default function AgentDashboardRedirect() {
  redirect("/dashboard/user");
}
