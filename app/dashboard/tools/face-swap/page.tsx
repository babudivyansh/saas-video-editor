import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import FaceSwapTool from "@/app/components/FaceSwapTool";

export default function FaceSwapPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <ToolsTopbar />
        <FaceSwapTool />
      </main>
    </div>
  );
}
