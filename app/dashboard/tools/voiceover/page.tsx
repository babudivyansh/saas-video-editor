import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import VoiceoverTool from "@/app/components/VoiceoverTool";
import { ClipForgeToolsStrip, AllToolsSection } from "@/app/components/ToolsShowcase";
import SiteFooter from "@/app/components/SiteFooter";

export default function VoiceoverPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <div className="mx-auto w-full max-w-[1440px] px-8 pb-2">
          <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">Voiceover Generator</h1>
          <p className="text-[13.5px] text-gray-500 mt-1">Turn any script into a natural AI voiceover. Pick a voice, paste your script, and generate.</p>
        </div>

        <VoiceoverTool />

        {/* Quick tools strip (image 1) */}
        <ClipForgeToolsStrip activeLabel="Voiceover Generator" />

        {/* All tools section (image 3) */}
        <AllToolsSection />

        {/* Site footer (image 2) */}
        <SiteFooter />
      </main>
    </div>
  );
}
