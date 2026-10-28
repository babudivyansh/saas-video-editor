// Elements › Shapes: each shape is drawn onto a transparent canvas in the
// chosen colour, uploaded once as a PNG Asset, and added as an image overlay
// — so it previews, moves, scales and exports exactly like any other image
// clip (the render pipeline needs nothing new). Drawing is pure canvas so it
// stays testable apart from the panel.

export type ShapeId = "rect" | "rounded" | "circle" | "triangle" | "star" | "line" | "arrow" | "bubble" | "frame" | "highlight";

export interface ShapeDef {
  id: ShapeId;
  label: string;
  /** Canvas size in px — wide shapes (line, highlight) get a wide canvas. */
  w: number;
  h: number;
  /** Starting width on the frame (ImageClip.scalePct). */
  scalePct: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, color: string) => void;
}

const stroke = (ctx: CanvasRenderingContext2D, color: string, width: number) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
};

export const SHAPES: ShapeDef[] = [
  { id: "rect", label: "Rectangle", w: 512, h: 384, scalePct: 0.4, draw: (c, w, h, col) => { c.fillStyle = col; c.fillRect(0, 0, w, h); } },
  {
    id: "rounded", label: "Rounded box", w: 512, h: 384, scalePct: 0.4,
    draw: (c, w, h, col) => { c.fillStyle = col; c.beginPath(); c.roundRect(0, 0, w, h, 64); c.fill(); },
  },
  { id: "circle", label: "Circle", w: 512, h: 512, scalePct: 0.3, draw: (c, w, h, col) => { c.fillStyle = col; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.fill(); } },
  {
    id: "triangle", label: "Triangle", w: 512, h: 448, scalePct: 0.3,
    draw: (c, w, h, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill(); },
  },
  {
    id: "star", label: "Star", w: 512, h: 512, scalePct: 0.25,
    draw: (c, w, h, col) => {
      c.fillStyle = col;
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? w / 2 : w / 4.6;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        c.lineTo(w / 2 + r * Math.cos(a), h / 2 + 12 + r * Math.sin(a));
      }
      c.closePath();
      c.fill();
    },
  },
  { id: "line", label: "Line", w: 1024, h: 64, scalePct: 0.6, draw: (c, w, h, col) => { stroke(c, col, 28); c.beginPath(); c.moveTo(20, h / 2); c.lineTo(w - 20, h / 2); c.stroke(); } },
  {
    id: "arrow", label: "Arrow", w: 768, h: 320, scalePct: 0.45,
    draw: (c, w, h, col) => {
      stroke(c, col, 44);
      c.beginPath(); c.moveTo(30, h / 2); c.lineTo(w - 50, h / 2);
      c.moveTo(w - 170, 50); c.lineTo(w - 40, h / 2); c.lineTo(w - 170, h - 50);
      c.stroke();
    },
  },
  {
    id: "bubble", label: "Speech bubble", w: 640, h: 512, scalePct: 0.4,
    draw: (c, w, h, col) => {
      c.fillStyle = col;
      c.beginPath(); c.roundRect(0, 0, w, h * 0.74, 70); c.fill();
      c.beginPath(); c.moveTo(w * 0.22, h * 0.7); c.lineTo(w * 0.14, h); c.lineTo(w * 0.42, h * 0.7); c.closePath(); c.fill();
    },
  },
  { id: "frame", label: "Frame", w: 768, h: 768, scalePct: 0.6, draw: (c, w, h, col) => { stroke(c, col, 36); c.beginPath(); c.roundRect(24, 24, w - 48, h - 48, 48); c.stroke(); } },
  {
    id: "highlight", label: "Highlight bar", w: 1024, h: 192, scalePct: 0.55,
    draw: (c, w, h, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(60, 0); c.lineTo(w, 0); c.lineTo(w - 60, h); c.lineTo(0, h); c.closePath(); c.fill(); },
  },
];

export const SHAPE_COLORS: { label: string; hex: string }[] = [
  { label: "White", hex: "#ffffff" },
  { label: "Emerald", hex: "#20d68a" },
  { label: "Lime", hex: "#c8ff55" },
  { label: "Amber", hex: "#fbbf24" },
  { label: "Red", hex: "#ef4444" },
  { label: "Sky", hex: "#38bdf8" },
  { label: "Pink", hex: "#f472b6" },
  { label: "Black", hex: "#000000" },
];

/** Draws `shape` in `color` and returns it as a PNG File ready for /api/upload. */
export async function renderShapePng(shape: ShapeDef, color: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = shape.w;
  canvas.height = shape.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  shape.draw(ctx, shape.w, shape.h, color);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't draw the shape");
  return new File([blob], `shape-${shape.id}-${color.slice(1)}.png`, { type: "image/png" });
}
