import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";

function ZapIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

interface Section {
  id: string;
  title: string;
}

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  sections: Section[];
  children: React.ReactNode;
}

export default function LegalPage({ title, lastUpdated, sections, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-white">
      <SiteNavbar solid />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex gap-16">
          {/* Sidebar — table of contents */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-24">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">On this page</p>
              <nav className="space-y-1">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block text-sm text-gray-500 hover:text-blue-600 py-1 border-l-2 border-transparent hover:border-blue-600 pl-3 transition-all"
                  >
                    {s.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <div className="mb-10">
              <h1 className="text-4xl font-extrabold text-gray-900 mb-3">{title}</h1>
              <p className="text-sm text-gray-400">Last updated: {lastUpdated}</p>
            </div>
            <div className="legal-content">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Simple footer */}
      <footer className="border-t border-gray-100 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-black text-gray-900 text-lg">
            <span className="bg-blue-600 text-white rounded-lg w-7 h-7 flex items-center justify-center">
              <ZapIcon />
            </span>
            CLIPIRO
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-gray-700">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-700">Terms of Service</Link>
            <Link href="/refund" className="hover:text-gray-700">Refund Policy</Link>
            <Link href="/affiliate-tos" className="hover:text-gray-700">Affiliate TOS</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
