import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import ImageGeneratorTool from "@/app/components/ImageGeneratorTool";

export default function ImageGeneratorPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <div className="mx-auto w-full max-w-[1440px] px-8 pb-2">
          <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">AI Image Generator</h1>
          <p className="text-[13.5px] text-gray-500 mt-1">Generate stunning images from text prompts using state-of-the-art AI models.</p>
        </div>
        <ImageGeneratorTool />
      </main>
    </div>
  );
}
