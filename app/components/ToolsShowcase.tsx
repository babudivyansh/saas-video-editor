import Link from "next/link";

// ── Icons ───────────────────────────────────────────────────────────────────
function IcImage() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>;
}
function IcFace() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>;
}
function IcMic() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></svg>;
}
function IcEraser() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M7 21h10M5 13l6-6 7 7-6 6H8z" /></svg>;
}
function IcVideo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="5" width="14" height="14" rx="2" /><path d="M22 8l-6 4 6 4z" /></svg>;
}
function IcYoutube() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="5" width="20" height="14" rx="4" /><path d="M10 9l5 3-5 3z" /></svg>;
}
function IcSpark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>;
}
function IcArrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>;
}

// ── Quick strip (image 1) ───────────────────────────────────────────────────
const QUICK_TOOLS = [
  { icon: <IcImage />, label: "Image Generator", href: "/dashboard/tools/image-generator" },
  { icon: <IcFace />, label: "AI Face Swap", href: "/dashboard/tools" },
  { icon: <IcMic />, label: "Voiceover Generator", href: "/dashboard/tools/voiceover" },
  { icon: <IcEraser />, label: "Background Remover", href: "/dashboard/tools" },
  { icon: <IcVideo />, label: "VEO3 Generator", href: "/dashboard/tools" },
  { icon: <IcYoutube />, label: "YouTube Downloader", href: "/dashboard/tools" },
];

export function ClipiroToolsStrip({ activeLabel }: { activeLabel?: string }) {
  return (
    <section className="mx-auto w-full max-w-[1440px] px-8 mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[17px] font-extrabold text-gray-900">Clipiro Tools</h2>
        <Link href="/dashboard/tools" className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-600 hover:text-blue-700">
          View All Tools <IcArrow />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {QUICK_TOOLS.map((t) => {
          const active = t.label === activeLabel;
          return (
            <Link
              key={t.label}
              href={t.href}
              className={`rounded-2xl border bg-white px-4 py-5 flex flex-col items-center text-center gap-2.5 transition-all ${
                active ? "border-blue-300 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
              }`}
            >
              <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">{t.icon}</span>
              <span className="text-[12.5px] font-semibold text-gray-700 leading-tight">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ── All tools section (image 3) ─────────────────────────────────────────────
const ALL_TOOLS = [
  { icon: <IcImage />, badge: "Popular", title: "AI Image Generator", desc: "Generate high quality images with AI in seconds.", href: "/dashboard/tools/image-generator" },
  { icon: <IcMic />, title: "AI Voiceover Generator", desc: "Make high quality voiceovers in seconds with 50+ narrators.", href: "/dashboard/tools/voiceover" },
  { icon: <IcSpark />, badge: "New", title: "AI Speech Enhancer", desc: "Enhance the quality of any audio or video file with AI.", href: "/dashboard/tools" },
  { icon: <IcVideo />, title: "AI Video Generator", desc: "VEO3 is a tool that lets you create videos with AI.", href: "/dashboard/tools" },
  { icon: <IcFace />, title: "AI Face Swap", desc: "Swap faces in any photo or video realistically.", href: "/dashboard/tools" },
  { icon: <IcEraser />, title: "Background Remover", desc: "Remove backgrounds from images and video instantly.", href: "/dashboard/tools" },
  { icon: <IcYoutube />, title: "YouTube Downloader", desc: "Download YouTube videos in a click.", href: "/dashboard/tools" },
  { icon: <IcSpark />, title: "AI Script Writer", desc: "Generate viral-ready scripts from a single topic.", href: "/dashboard/tools" },
];

export function AllToolsSection() {
  return (
    <section className="mx-auto w-full max-w-[1440px] px-8 mt-12">
      <h2 className="text-[17px] font-extrabold text-gray-900 mb-4">All Tools</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {ALL_TOOLS.map((t) => (
          <div key={t.title} className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">{t.icon}</span>
              {t.badge && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">{t.badge}</span>
              )}
            </div>
            <h3 className="text-[15px] font-bold text-gray-900">{t.title}</h3>
            <p className="text-[12.5px] text-gray-500 mt-1.5 leading-relaxed flex-1">{t.desc}</p>
            <Link
              href={t.href}
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-[13px] font-semibold text-gray-700 px-4 py-2.5 transition-colors"
            >
              Get Started
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
