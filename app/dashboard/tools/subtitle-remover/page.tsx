import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import SubtitleRemoverTool from "@/app/components/SubtitleRemoverTool";

export default function SubtitleRemoverPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <ToolsTopbar />
        <SubtitleRemoverTool />
      </main>
    </div>
  );
}
