"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// One muted, looping demo video in the hero carousel.
//
// Nothing downloads until the panel it sits in is near the stage (`load`):
// the src is only set then, with preload="none" before that, so the six
// panels cost one poster each on first paint. It plays only while `playing`
// (its panel is the active one, the carousel is on screen and the visitor
// hasn't asked for reduced motion) and is paused otherwise, so at most one
// panel's videos are ever decoding.

interface LoopVideoProps {
  src: string;
  poster: string;
  load: boolean;
  playing: boolean;
  className?: string;
  /** Restart from 0 when it starts playing, so overlays timed to it line up. */
  restart?: boolean;
}

const LoopVideo = forwardRef<HTMLVideoElement | null, LoopVideoProps>(function LoopVideo(
  { src, poster, load, playing, className = "", restart = false },
  ref,
) {
  const el = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => el.current as HTMLVideoElement);

  useEffect(() => {
    const v = el.current;
    if (!v || !load) return;
    if (playing) {
      if (restart) v.currentTime = 0;
      v.muted = true;
      // Autoplay can be refused (Low Power Mode): the poster stays up.
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playing, load, restart]);

  return (
    <video
      ref={el}
      className={`block h-full w-full object-cover ${className}`}
      poster={poster}
      src={load ? src : undefined}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
    />
  );
});

export default LoopVideo;
