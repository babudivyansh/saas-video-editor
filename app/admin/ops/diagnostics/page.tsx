import { redirect } from "next/navigation";

// Incident Tools moved into the Operations page as a tab.
export default function AdminOpsDiagnosticsPage() {
  redirect("/admin/ops?tab=incident");
}
