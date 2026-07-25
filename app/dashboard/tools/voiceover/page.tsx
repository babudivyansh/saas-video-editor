import VoiceoverTool from "@/app/components/VoiceoverTool";

export default function VoiceoverPage() {
  return (
    <>
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-8 pt-6 pb-2">
        <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">Voiceover Generator</h1>
        <p className="text-[13.5px] text-gray-500 mt-1">Turn any script into a natural AI voiceover. Pick a voice, paste your script, and generate.</p>
      </div>

      <VoiceoverTool />
    </>
  );
}
