import VoiceChangerTool from "@/app/components/VoiceChangerTool";

export const metadata = { title: "AI Voice Changer" };

export default function VoiceChangerPage() {
  return (
    <div className="min-h-full bg-surface-2">
      <VoiceChangerTool />
    </div>
  );
}
