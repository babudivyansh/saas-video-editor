import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import FreeToolUploader from "@/app/components/FreeToolUploader";

function IcVideo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="5" width="14" height="14" rx="2"/><path d="M22 7l-6 5 6 5V7z"/></svg>;
}

export default function VideoCompressorPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <FreeToolUploader
          icon={<IcVideo />}
          title="Compress Video"
          subtitle="Upload a video to compress."
          uploadTitle="Upload video"
          fileTypes=".mp4, .mov, .webm, .mkv, .ogv, .qt"
          acceptAttr="video/*"
          buttonLabel="Generate Video"
          shortcut="⌘+Enter"
        />
      </main>
    </div>
  );
}
