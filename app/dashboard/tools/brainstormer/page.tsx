import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import BrainstormerTool from "@/app/components/BrainstormerTool";

export const metadata = { title: "AI Brainstormer – Clipiro" };

export default function BrainstormerPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <ToolsSidebar active="create" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ToolsTopbar />
        <main className="flex-1 overflow-y-auto">
          <BrainstormerTool />
        </main>
      </div>
    </div>
  );
}
