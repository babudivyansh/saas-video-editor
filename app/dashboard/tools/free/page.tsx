import Link from "next/link";

function IcEqualizer() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5"><path d="M4 12v3M8 8v10M12 5v14M16 9v7M20 11v4"/></svg>;
}
function IcVideoFile() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M10 12.5l4 2.5-4 2.5z"/></svg>;
}
function IcFileAudio() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 16a1.5 1.5 0 103 0v-3.5l3-1V15a1.5 1.5 0 103 0"/></svg>;
}

const FREE_TOOLS = [
  { icon: <IcEqualizer />, title: "Audio Balancer", desc: "Balance between the left and right channels", href: "/dashboard/tools/free/audio-balancer", iconBg: "bg-blue-600" },
  { icon: <IcVideoFile />, title: "Video Compressor", desc: "Compress video files to reduce file size", href: "/dashboard/tools/free/video-compressor", iconBg: "bg-blue-600" },
  { icon: <IcFileAudio />, title: "MP3 Converter", desc: "Convert any media file to MP3", href: "/dashboard/tools/free/mp3-converter", iconBg: "bg-blue-600" },
];

export default function FreeToolsPage() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-8 pt-6 pb-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {FREE_TOOLS.map((t, i) => (
          <Link
            key={i}
            href={t.href}
            className="rounded-2xl border border-gray-200 bg-white p-5 hover:shadow-md hover:border-gray-300 transition-all"
          >
            <div className={`w-10 h-10 rounded-xl ${t.iconBg} flex items-center justify-center text-white mb-4`}>
              {t.icon}
            </div>
            <h3 className="text-[15px] font-bold text-gray-900 leading-tight">{t.title}</h3>
            <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
