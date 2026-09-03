// Logo assets for the emerald design system.
//
// Two files, deliberately:
//   /icon.png          the mark alone, emerald — also the favicon and the
//                      lockup used on the auth pages
//   /logo-emerald.png  the horizontal lockup: emerald mark + near-white
//                      wordmark, for the dark app and marketing chrome
//
// /logo.png stays BLUE and is not used here. lib/email/tokens.ts serves that
// exact file to transactional emails (LOGO_URL), which render on a white
// background where the emerald wordmark would be invisible and the emerald
// mark only ~2:1. Don't "fix" that one to match.

export function ClipiroMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src="/icon.png"
      alt="Clipiro Mark"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}

export default function ClipiroLogo({ className = "h-9" }: { className?: string }) {
  return (
    <img
      src="/logo-emerald.png"
      alt="Clipiro Logo"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
