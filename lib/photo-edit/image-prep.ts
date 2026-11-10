import sharp from "sharp";
import { UserFacingError } from "@/lib/user-facing-error";

// Everything Photo Edit does to pixels on our own server: normalise an input
// before it goes to a model, read a mask painted in the browser, and build the
// padded canvas and mask that make Expand an inpaint.

/** Longest edge sent to a model. Every edit model works at ~1-2K; more only adds upload time and cost. */
export const MAX_EDGE = 2048;

export interface PreparedImage {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

const UNREADABLE = "We couldn't read this image. Use a JPG, PNG or WebP file.";

/** EXIF-rotated, at most MAX_EDGE on the long side; PNG when it has transparency, else high-quality JPEG. */
export async function prepareImage(input: Buffer): Promise<PreparedImage> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new UserFacingError(UNREADABLE);
  }
  if (!meta.width || !meta.height) throw new UserFacingError(UNREADABLE);

  const pipeline = sharp(input).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
  const out = meta.hasAlpha
    ? await pipeline.png().toBuffer({ resolveWithObject: true })
    : await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    mimeType: meta.hasAlpha ? "image/png" : "image/jpeg",
    width: out.info.width,
    height: out.info.height,
  };
}

/** The MIME type of a model's output, from its bytes (fal hands back PNG or JPEG depending on the model). */
export async function sniffImageMime(buf: Buffer): Promise<"image/png" | "image/jpeg" | "image/webp"> {
  const { format } = await sharp(buf).metadata();
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

/**
 * A mask painted in the browser (a PNG data URL, white strokes on black or on
 * transparency) as a black/white PNG the same size as the image. White is the
 * area to change, the convention FLUX Fill and GPT Image both use.
 */
export async function prepareMask(dataUrl: string, width: number, height: number): Promise<Buffer> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new UserFacingError("The mask didn't come through. Paint the area again.");
  const raw = Buffer.from(m[1], "base64");
  if (raw.length > 8 * 1024 * 1024) throw new UserFacingError("The mask is too large.");

  // Flatten transparency onto black, then hard-threshold: anti-aliased brush
  // edges would otherwise leave a grey band the model treats as half-masked.
  const { data, info } = await sharp(raw)
    .flatten({ background: "#000000" })
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .threshold(64)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let painted = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > 0) painted++;
  if (painted < data.length * 0.001) throw new UserFacingError("Paint over the area you want to change first.");

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
}

export { EXPAND_RATIOS, expandedSize, type ExpandRatio } from "@/lib/photo-edit/ratios";
import { expandedSize, type ExpandRatio } from "@/lib/photo-edit/ratios";

/** How far the mask reaches back into the original, so the seam is blended instead of a hard line. */
const SEAM_OVERLAP = 12;

/**
 * The padded canvas and its mask for Expand. The original sits centred; the new
 * border is the mask. The border starts as a blurred, stretched copy of the
 * photo rather than flat grey, which gives the fill model the right colours to
 * continue from. Scaled down so the canvas stays within MAX_EDGE.
 */
export async function buildExpandCanvas(img: PreparedImage, ratio: ExpandRatio): Promise<{ canvas: Buffer; mask: Buffer; width: number; height: number }> {
  let { width: cw, height: ch } = expandedSize(img.width, img.height, ratio);
  if (cw === img.width && ch === img.height) {
    throw new UserFacingError(`This photo is already ${ratio}. Pick a different shape to expand to.`);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(cw, ch));
  cw = Math.round(cw * scale);
  ch = Math.round(ch * scale);
  const iw = Math.round(img.width * scale);
  const ih = Math.round(img.height * scale);
  const left = Math.round((cw - iw) / 2);
  const top = Math.round((ch - ih) / 2);

  const inner = await sharp(img.buffer).resize(iw, ih).png().toBuffer();
  const backdrop = await sharp(img.buffer).resize(cw, ch, { fit: "fill" }).blur(40).png().toBuffer();
  const canvas = await sharp(backdrop).composite([{ input: inner, left, top }]).png().toBuffer();

  // Overlap only on the sides that grew: an edge that touches the canvas
  // border has no seam, and masking it would repaint part of the photo.
  const ox = left > 0 ? SEAM_OVERLAP : 0;
  const oy = top > 0 ? SEAM_OVERLAP : 0;
  const keepW = Math.max(1, iw - 2 * ox);
  const keepH = Math.max(1, ih - 2 * oy);
  const keep = await sharp({ create: { width: keepW, height: keepH, channels: 3, background: "#000000" } }).png().toBuffer();
  const mask = await sharp({ create: { width: cw, height: ch, channels: 3, background: "#ffffff" } })
    .composite([{ input: keep, left: left + ox, top: top + oy }])
    .png()
    .toBuffer();

  return { canvas, mask, width: cw, height: ch };
}
