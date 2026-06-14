"use client";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen bg-zinc-950">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-zinc-800">
        <span className="text-xl font-bold tracking-tight text-white">ClipForge</span>
        <div className="flex gap-4">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center flex-1 px-4 py-24 text-center">
        <div className="inline-block text-xs font-semibold tracking-widest text-violet-400 uppercase bg-violet-900/30 border border-violet-700/50 rounded-full px-4 py-1 mb-6">
          AI-Powered Faceless Videos
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold text-white max-w-3xl leading-tight">
          Turn any idea into a viral{" "}
          <span className="text-violet-400">short-form video</span>
        </h1>
        <p className="mt-6 text-lg text-zinc-400 max-w-xl">
          AI script + voice + animated captions + background video, all compiled and ready in
          seconds. No editing skills required.
        </p>
        <div className="flex gap-4 mt-10">
          <Link
            href="/register"
            className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-8 py-3 rounded-xl text-base transition-colors"
          >
            Start for free
          </Link>
          <Link
            href="/dashboard"
            className="border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold px-8 py-3 rounded-xl text-base transition-colors"
          >
            View dashboard
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-8 pb-24 max-w-5xl mx-auto w-full">
        {[
          { icon: "✍️", title: "AI Script", desc: "Gemini generates a hook + narration from your topic in seconds." },
          { icon: "🎙️", title: "AI Voiceover", desc: "ElevenLabs TTS with word-level timestamps for perfect caption sync." },
          { icon: "🎬", title: "Auto Compile", desc: "FFmpeg burns in animated captions and exports a 9:16 ready-to-post MP4." },
        ].map((f) => (
          <div key={f.title} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-white mb-1">{f.title}</h3>
            <p className="text-sm text-zinc-400">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-zinc-800 text-center py-6 text-xs text-zinc-600">
        ClipForge &copy; {new Date().getFullYear()}
      </footer>
    </main>
  );
}
