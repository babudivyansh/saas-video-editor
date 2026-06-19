import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import EnhanceSpeechTool from "@/app/components/EnhanceSpeechTool";

export default function EnhanceSpeechPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <ToolsTopbar />
        <EnhanceSpeechTool />
      </main>
    </div>
  );
}
