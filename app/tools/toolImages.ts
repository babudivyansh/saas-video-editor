// Designed illustrations for the tool pages, where one exists.
//
// The inline-SVG motifs in components/marketing/toolMotifs.tsx remain the
// default and cover all 22 tools. A slug listed here renders its artwork
// instead — the opt-in path for tools that have had a real piece designed.
//
// Only the illustration is ever baked into the file. Headline, subhead and CTA
// stay as live HTML: these pages exist to rank, and an <h1> made of pixels
// ranks for nothing.

export interface ToolImageFile {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Tiny inline WebP shown by next/image while the full file loads. */
  blurDataURL: string;
}

export interface ToolImageSet {
  primary: ToolImageFile;
  /** Rendered directly beneath the first, still inside the hero. */
  secondary?: ToolImageFile;
}

export const TOOL_IMAGES: Record<string, ToolImageSet> = {
  "auto-clip": {
    primary: {
      src: "/tools/auto-clip-hero.webp",
      alt: "One long podcast recording in a player, with three vertical short clips branching off it, each captioned.",
      width: 1421,
      height: 1290,
      blurDataURL:
        "data:image/webp;base64,UklGRoYAAABXRUJQVlA4IHoAAADwAQCdASoQAA8AA4BaJZwAD48QkXFNOgAA/rgOVh52PsrSlyXtLbR0tcDzUFLy5o58nG2Be6ESOjuBq1tucdkgBsnpcHqP103gyK38hlXcvHbZ1u/j+7x0ePpAe3M6V2AUMqnTMYIeytWCP30EZB2cXNQxIqDdwBAAAA==",
    },
    secondary: {
      src: "/tools/auto-clip-workflow.webp",
      alt: "The three steps in order: upload a long video, AI marks the highlights on a timeline, and finished vertical clips come out.",
      width: 1790,
      height: 1060,
      blurDataURL:
        "data:image/webp;base64,UklGRloAAABXRUJQVlA4IE4AAACwAQCdASoQAAkAA4BaJZwAAsYh7XiYAP5rYFoaSVL+Ky5rBXHvuXMCXdx8WNJ5mbryW2Y8BLHnJ8xCLtOA2p5dwMizLSJs3m6DOU3oUAA=",
    },
  },
};

export function getToolImages(slug: string): ToolImageSet | undefined {
  return TOOL_IMAGES[slug];
}
