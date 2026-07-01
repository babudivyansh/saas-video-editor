import { ToolCard } from "@clipiro/ui";

export function ToolList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
      <ToolCard name="AI Image Generator" engine="Flux" cost={1} />
      <ToolCard name="AI Voiceover" engine="ElevenLabs TTS" cost={2} />
      <ToolCard name="AI Vocal Remover" engine="Demucs" cost={2} />
      <ToolCard name="AI Video Generator (Veo3)" engine="Google Veo3" cost={35} veo3 />
      <ToolCard name="MP3 Converter" engine="FFmpeg" cost="free" />
    </div>
  );
}
