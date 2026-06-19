import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import VideoGeneratorTool from "@/app/components/VideoGeneratorTool";

export default function VideoGeneratorPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <ToolsTopbar />
        <VideoGeneratorTool />
      </main>
    </div>
  );
}
