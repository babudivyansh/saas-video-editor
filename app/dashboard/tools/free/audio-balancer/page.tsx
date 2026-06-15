import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import FreeToolUploader from "@/app/components/FreeToolUploader";

function IcMusicNote() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
}

export default function AudioBalancerPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <FreeToolUploader
          icon={<IcMusicNote />}
          title="Balance Audio"
          subtitle="Upload an audio or video file to normalize and balance audio."
          uploadTitle="Upload audio or video"
          fileTypes=".mp3, .wav, .aac, .ogg, .flac, .m4a, .webm, .mp4, .mov, .avi, .mkv, .webm, .m4v"
          acceptAttr="audio/*,video/*"
          buttonLabel="Balance Audio"
          apiEndpoint="/api/tools/audio-balancer"
          outputFilename="balanced-audio.mp3"
        />
      </main>
    </div>
  );
}
