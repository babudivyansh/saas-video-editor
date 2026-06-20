import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import BackgroundRemoverTool from "@/app/components/BackgroundRemoverTool";

export default function BackgroundRemoverPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <ToolsTopbar />
        <BackgroundRemoverTool />
      </main>
    </div>
  );
}
