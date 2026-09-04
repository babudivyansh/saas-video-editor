import type { Metadata } from "next";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import { Button } from "@/app/components/ui/Button";

// noindex: a transactional landing page reached only from an email link. It
// has no search value and would dilute the blog's own indexing.
export const metadata: Metadata = {
  title: "Subscription confirmed",
  robots: { index: false, follow: false },
};

export default function NewsletterConfirmedPage() {
  return (
    <div className="min-h-screen bg-bg text-fg font-sans">
      <SiteNavbar solid />
      <main className="mx-auto w-full max-w-xl px-4 py-24 text-center md:px-6">
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">You&apos;re subscribed 🎉</h1>
        <p className="mx-auto mt-4 max-w-md text-ink-soft">
          Thanks for confirming. You&apos;ll get the Clipiro creator playbook roughly twice a month — practical
          short-form tactics, nothing else.
        </p>
        <div className="mt-8">
          <Button href="/blog" size="lg">
            Read the blog
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
