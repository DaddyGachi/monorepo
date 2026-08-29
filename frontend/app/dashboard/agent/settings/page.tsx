import { redirect } from "next/navigation";

export default function AgentSettingsRedirect() {
  redirect("/dashboard/user");
}
