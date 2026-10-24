import Image from "next/image";
import type { ReactNode } from "react";

// Right-hand artwork on /login, /register and the sign-in popup (AuthModal).
// The headline + tagline are part of the artwork itself, so this is decorative
// (empty alt). `children` render as an overlay across the top of the art — the
// popup uses it for the "Free tool / Premium feature" context.
const ART = {
  login: "/auth/signin-art.webp",
  register: "/auth/signup-art.webp",
} as const;

export default function AuthArtPanel({ mode, children }: { mode: keyof typeof ART; children?: ReactNode }) {
  return (
    <div className="hidden sm:flex w-[300px] lg:w-[340px] flex-shrink-0 p-4 border-l border-line">
      <div className="relative w-full overflow-hidden rounded-2xl bg-bg">
        <Image
          src={ART[mode]}
          alt=""
          fill
          priority
          sizes="340px"
          className="object-cover object-bottom"
        />
        {children && <div className="absolute inset-x-3 top-3">{children}</div>}
      </div>
    </div>
  );
}
