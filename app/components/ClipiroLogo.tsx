export function ClipiroMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Clipiro Mark"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}

export default function ClipiroLogo({ className = "h-9" }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Clipiro Logo"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
