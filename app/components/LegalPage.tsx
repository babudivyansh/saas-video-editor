import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";

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

      <SiteFooter />
    </div>
  );
}
