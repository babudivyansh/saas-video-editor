"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

// Brush mask for Erase: the user paints over the photo; the painted area is the
// part the model changes. The canvas works at the photo's own pixel size (up to
// 2048 on the long edge, the size the server sends to the model) and is scaled
// to fit by CSS, so a stroke lands in the same place whatever the screen size.

export interface MaskCanvasHandle {
  /** White-on-transparent PNG data URL of the painted area, or null when nothing is painted. */
  exportMask: () => string | null;
  clear: () => void;
}

const MAX_EDGE = 2048;

export const MaskCanvas = forwardRef<MaskCanvasHandle, { src: string; brush: number; onPaintedChange: (painted: boolean) => void }>(
  function MaskCanvas({ src, brush, onPaintedChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const painted = useRef(false);
    const history = useRef<ImageData[]>([]);

    const setPainted = useCallback((v: boolean) => {
      if (painted.current !== v) { painted.current = v; onPaintedChange(v); }
    }, [onPaintedChange]);

    useImperativeHandle(ref, () => ({
      exportMask() {
        const c = canvasRef.current;
        if (!c || !painted.current) return null;
        const out = document.createElement("canvas");
        out.width = c.width;
        out.height = c.height;
        const ctx = out.getContext("2d")!;
        ctx.drawImage(c, 0, 0);
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);
        return out.toDataURL("image/png");
      },
      clear() {
        const c = canvasRef.current;
        c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
        history.current = [];
        setPainted(false);
      },
    }), [setPainted]);

    // Size the canvas to the photo.
    useEffect(() => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        setSize({ w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) });
      };
      img.src = src;
      history.current = [];
      setPainted(false);
    }, [src, setPainted]);

    const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const c = canvasRef.current!;
      const r = c.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, scale: c.width / r.width };
    };

    const stroke = (from: { x: number; y: number }, to: { x: number; y: number }, width: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.strokeStyle = "rgba(32, 214, 138, 1)";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    };

    function undo() {
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      const prev = history.current.pop();
      if (!c || !ctx) return;
      if (!prev) { ctx.clearRect(0, 0, c.width, c.height); setPainted(false); return; }
      ctx.putImageData(prev, 0, 0);
      let any = false;
      for (let i = 3; i < prev.data.length; i += 16) if (prev.data[i] > 0) { any = true; break; }
      setPainted(any);
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-line bg-surface-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Photo to paint over" className="block max-h-[620px] w-full object-contain" draggable={false} />
          {size && (
            <canvas
              ref={canvasRef}
              width={size.w}
              height={size.h}
              aria-label="Paint over the area to change"
              className="absolute inset-0 m-auto h-full max-h-[620px] w-full cursor-crosshair touch-none object-contain opacity-55"
              style={{ aspectRatio: `${size.w} / ${size.h}`, width: "auto", maxWidth: "100%" }}
              onPointerDown={(e) => {
                const c = canvasRef.current;
                const ctx = c?.getContext("2d");
                if (!c || !ctx) return;
                history.current.push(ctx.getImageData(0, 0, c.width, c.height));
                if (history.current.length > 20) history.current.shift();
                e.currentTarget.setPointerCapture(e.pointerId);
                drawing.current = true;
                const p = point(e);
                last.current = p;
                stroke(p, p, brush * p.scale);
                setPainted(true);
              }}
              onPointerMove={(e) => {
                if (!drawing.current || !last.current) return;
                const p = point(e);
                stroke(last.current, p, brush * p.scale);
                last.current = p;
              }}
              onPointerUp={() => { drawing.current = false; last.current = null; }}
              onPointerCancel={() => { drawing.current = false; last.current = null; }}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={undo} className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg-muted hover:text-fg">Undo stroke</button>
          <button
            type="button"
            onClick={() => { const c = canvasRef.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); history.current = []; setPainted(false); }}
            className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg-muted hover:text-fg"
          >
            Clear
          </button>
        </div>
      </div>
    );
  },
);
