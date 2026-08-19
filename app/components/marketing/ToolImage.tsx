import Image from "next/image";

/**
 * A supplied illustration for a tool page, used where a designed asset exists.
 *
 * The SVG motifs in ToolMock are the default — they cost nothing, scale
 * perfectly, and cover all 22 tools. This is the opt-in path for tools that
 * have a real piece of artwork, and it deliberately matches ToolMock's frame
 * so the two can sit on the same page without looking like different systems.
 *
 * Only the artwork itself is ever baked into the file. Headline, subhead and
 * CTA stay as live HTML — a hero whose <h1> is pixels is invisible to search,
 * which is the whole reason these pages exist.
 */
export default function ToolImage({
  src,
  alt,
  width,
  height,
  blurDataURL,
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  blurDataURL: string;
  /** Set on the first illustration only — it is the LCP candidate. */
  priority?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-card-border bg-white shadow-card transition-all duration-200 hover:shadow-card-hover motion-safe:hover:-translate-y-1">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        placeholder="blur"
        blurDataURL={blurDataURL}
        priority={priority}
        // The artwork carries fine UI detail and small caption text that the
        // default quality of 75 visibly softens.
        quality={90}
        sizes="(min-width: 1280px) 1100px, (min-width: 768px) 90vw, 100vw"
        className="block h-auto w-full"
      />
    </div>
  );
}
