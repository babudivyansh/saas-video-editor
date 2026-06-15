import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import FreeToolUploader from "@/app/components/FreeToolUploader";

function IcFileAudio() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 16a1.5 1.5 0 103 0v-3.5l3-1V15a1.5 1.5 0 103 0"/></svg>;
}

export default function Mp3ConverterPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <FreeToolUploader
          icon={<IcFileAudio />}
          title="Convert to MP3"
          subtitle="Upload an audio or video file to convert to MP3."
          uploadTitle="Upload audio or video"
          fileTypes=".mp3, .wav, .aac, .ogg, .flac, .m4a, .webm, .mp4, .mov, .avi, .mkv, .webm, .m4v"
          acceptAttr="audio/*,video/*"
          buttonLabel="Convert"
          apiEndpoint="/api/tools/mp3-converter"
          outputFilename="converted.mp3"
        />
      </main>
    </div>
  );
}
