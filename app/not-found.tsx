import Link from "next/link";

function BoltIcon() {
  return (
    <div className="bg-blue-600 rounded-xl w-12 h-12 flex items-center justify-center">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    </div>
  );
}

export default function NotFound() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <BoltIcon />
        <p className="mt-6 text-7xl font-black text-zinc-800 select-none">404</p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-100">Page not found</h1>
        <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
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
            className="px-5 py-2.5 rounded-full border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 text-sm font-semibold transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
