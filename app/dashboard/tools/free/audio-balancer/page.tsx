"use client";
import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import AudioBalancerTool from "@/app/components/AudioBalancerTool";

export default function AudioBalancerPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <AudioBalancerTool />
      </main>
    </div>
  );
}
