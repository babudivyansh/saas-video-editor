import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import VoiceChangerTool from "@/app/components/VoiceChangerTool";

export default function VoiceChangerPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <ToolsTopbar />
        <VoiceChangerTool />
      </main>
    </div>
  );
}
