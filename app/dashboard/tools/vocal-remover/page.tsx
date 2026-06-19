import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import VocalRemoverTool from "@/app/components/VocalRemoverTool";

export default function VocalRemoverPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <ToolsTopbar />
        <VocalRemoverTool />
      </main>
    </div>
  );
}
