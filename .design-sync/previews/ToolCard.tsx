import { ToolCard } from "@clipiro/ui";

// `preview` is the artwork block at the top — in the app each tool passes its
// own illustration. A gradient panel stands in for that artwork here.
const Art = ({ label }: { label: string }) => (
  <div className="aspect-video grad-brand flex items-center justify-center">
    <span className="text-sm font-bold text-on-primary">{label}</span>
  </div>
);

export const Default = () => (
  <div className="grid grid-cols-2 gap-4 max-w-xl">
    <ToolCard
      title="AutoClip"
      desc="Turn one long video into a week of Shorts, captioned and reframed."
      href="#"
      badge="New"
      preview={<Art label="AutoClip" />}
    />
    <ToolCard
      title="Background remover"
      desc="Cut the subject out of any clip without a green screen."
      href="#"
      preview={<Art label="Background remover" />}
    />
  </div>
);

// size="sm" is the dense variant for tool grids: inline CTA instead of a full-width button.
export const Small = () => (
  <div className="grid grid-cols-3 gap-3 max-w-2xl">
    <ToolCard size="sm" title="Video compressor" desc="Shrink files for upload." href="#" cta="Open" preview={<Art label="Compress" />} />
    <ToolCard size="sm" title="MP3 converter" desc="Pull audio from any video." href="#" cta="Open" preview={<Art label="MP3" />} />
    <ToolCard size="sm" title="Audio balancer" desc="Level loud and quiet speakers." href="#" cta="Open" preview={<Art label="Balance" />} />
  </div>
);
