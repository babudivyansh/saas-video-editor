// Minimal types for the parts of fontkit 2 the caption engine uses (the
// package ships none).
declare module "fontkit" {
  export interface GlyphPosition {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }
  export interface GlyphRun {
    positions: GlyphPosition[];
  }
  export interface Font {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    fullName: string;
    postscriptName: string;
    familyName: string;
    variationAxes?: Record<string, unknown>;
    layout(text: string): GlyphRun;
    hasGlyphForCodePoint(codePoint: number): boolean;
  }
  export function create(buffer: Buffer | Uint8Array, postscriptName?: string): Font | { fonts: Font[] };
  export function openSync(path: string, postscriptName?: string): Font;
}
