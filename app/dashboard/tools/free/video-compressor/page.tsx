"use client";
import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import VideoCompressorTool from "@/app/components/VideoCompressorTool";

export default function VideoCompressorPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <VideoCompressorTool />
      </main>
    </div>
  );
}
