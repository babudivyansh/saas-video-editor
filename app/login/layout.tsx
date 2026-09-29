import type { Metadata } from "next";

// Account pages have their own title (they inherited the homepage's) and stay
// out of search results: they're only useful when you arrive with a reason.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Clipiro account.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
