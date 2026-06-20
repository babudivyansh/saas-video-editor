"use client";
import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import Mp3ConverterTool from "@/app/components/Mp3ConverterTool";

export default function Mp3ConverterPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <Mp3ConverterTool />
      </main>
    </div>
  );
}
