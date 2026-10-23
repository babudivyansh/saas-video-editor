import Image from "next/image";

// Right-hand artwork on /login and /register. The headline + tagline are part
// of the artwork itself, so this is decorative (empty alt).
const ART = {
  login: "/auth/signin-art.webp",
  register: "/auth/signup-art.webp",
} as const;

export default function AuthArtPanel({ mode }: { mode: keyof typeof ART }) {
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
      </div>
    </div>
  );
}
