import Link from "next/link";

function BoltIcon() {
  return <img src="/icon.png" alt="Clipiro" className="w-12 h-12 rounded-xl" />;
}

export default function NotFound() {
  return (
    <main className="theme-emerald min-h-screen bg-bg text-fg flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <BoltIcon />
        <p className="mt-6 text-7xl font-black text-surface-3 select-none">404</p>
        <h1 className="mt-2 text-2xl font-bold text-fg">Page not found</h1>
        <p className="mt-3 text-fg-muted text-sm leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/"
            className="px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            Go home
          </Link>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-full border border-line hover:border-line-strong text-fg-muted hover:text-fg text-sm font-semibold transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
