import type { Metadata } from "next";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import { Button } from "@/app/components/ui/Button";

// noindex — see the confirmed page; same reasoning.
export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

export default function NewsletterUnsubscribedPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <SiteNavbar solid />
      <main className="mx-auto w-full max-w-xl px-4 py-24 text-center md:px-6">
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">You&apos;re unsubscribed</h1>
        <p className="mx-auto mt-4 max-w-md text-ink-soft">
          You won&apos;t receive the newsletter again. No hard feelings — the blog stays free and open either way.
        </p>
        <div className="mt-8">
          <Button href="/blog" size="lg" variant="secondary">
            Back to the blog
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
