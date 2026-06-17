import Link from "next/link";

function ZapIcon({ className = "w-4 h-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
}
function TwitterIcon({ className = "w-4 h-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>;
}
function InstagramIcon({ className = "w-4 h-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 01-1.38-.9 3.7 3.7 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 3.18a6.66 6.66 0 100 13.32 6.66 6.66 0 000-13.32zm0 10.98a4.32 4.32 0 110-8.64 4.32 4.32 0 010 8.64zm6.48-11.24a1.56 1.56 0 11-3.12 0 1.56 1.56 0 013.12 0z" /></svg>;
}
function DiscordIcon({ className = "w-4 h-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M20.317 4.369a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 00-5.487 0 12.6 12.6 0 00-.617-1.25.077.077 0 00-.079-.036A19.74 19.74 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.009c.12.099.246.198.373.292a.077.077 0 01-.006.127c-.598.349-1.225.645-1.873.891a.076.076 0 00-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 00-.031-.029zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>;
}

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Workflows",
    links: [
      { label: "Classic Split Screen", href: "/dashboard/create/split-video" },
      { label: "Vertical Split Screen", href: "/dashboard/create/viral-split-screen" },
      { label: "Reddit Story Video", href: "/dashboard/create/reddit-video" },
      { label: "Fake Texts Video", href: "/dashboard/create/text-video" },
      { label: "Streamer Video", href: "/dashboard/create/streamer-video" },
    ],
  },
  {
    title: "AI Tools",
    links: [
      { label: "Voiceover Generator", href: "/dashboard/tools/voiceover" },
      { label: "Image Generator", href: "/dashboard/tools" },
      { label: "Video Generator (VEO3)", href: "/dashboard/tools" },
      { label: "Vocal Remover", href: "/dashboard/tools" },
      { label: "Video & Image Background Remover", href: "/dashboard/tools" },
    ],
  },
  {
    title: "Free Tools",
    links: [
      { label: "Audio Balancer", href: "/dashboard/tools/free/audio-balancer" },
      { label: "Video Compressor", href: "/dashboard/tools/free/video-compressor" },
      { label: "MP3 Converter", href: "/dashboard/tools/free/mp3-converter" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Enterprise", href: "/pricing" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Refund policy", href: "/refund" },
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Affiliate TOS", href: "/affiliate-tos" },
    ],
  },
];

const SOCIALS = [
  { icon: <TwitterIcon />, label: "X (Twitter)" },
  { icon: <InstagramIcon />, label: "Instagram" },
  { icon: <DiscordIcon />, label: "Discord" },
];

export default function SiteFooter() {
  return (
    <footer className="bg-blue-600 px-4 sm:px-6 lg:px-8 pt-10 pb-10 mt-16">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl px-10 pt-10 pb-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 mb-10">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <div className="text-gray-900 font-bold text-sm mb-4">{col.title}</div>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-gray-100">
            <Link href="/" className="flex items-center gap-2 font-black text-2xl text-gray-900 tracking-tight">
              <span className="bg-blue-600 text-white rounded-lg w-8 h-8 flex items-center justify-center">
                <ZapIcon />
              </span>
              CLIPFORGE
            </Link>
            <div className="flex items-center gap-2">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
