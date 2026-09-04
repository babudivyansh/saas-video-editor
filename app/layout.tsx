import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/app/components/AuthContext";
import AuthModal from "@/app/components/AuthModal";
import QueryProvider from "@/app/components/QueryProvider";
import WebVitals from "@/app/components/analytics/WebVitals";

// Geist replaces Plus Jakarta Sans as the UI face for the emerald design
// system: a neutral grotesk reads as more restrained at the large heading
// sizes the new system leans on. Geist Mono was already here, so the two are a
// matched pair.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://clipiro.com"),
  title: {
    default: "Clipiro — Create Viral Shorts From Long Videos in Seconds",
    template: "%s · Clipiro",
  },
  description:
    "Clipiro turns podcasts, interviews, webinars, and YouTube videos into viral short-form clips with AI-powered clipping, captions, and one-click social formatting for Reels and Shorts.",
  keywords: [
    "AI video clipping",
    "viral shorts generator",
    "auto captions",
    "YouTube to Shorts",
    "podcast clips",
    "Instagram Reels video maker",
    "AI faceless video",
    "Clipiro",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    type: "website",
    siteName: "Clipiro",
    title: "Clipiro — Create Viral Shorts From Long Videos in Seconds",
    description:
      "Transform long videos into engaging short-form content with AI clipping, captions, and social media optimization.",
    url: "https://clipiro.com",
  },
  twitter: {
    card: "summary_large_image",
    site: "@ClipiroOfficial",
    creator: "@ClipiroOfficial",
    title: "Clipiro — Create Viral Shorts From Long Videos in Seconds",
    description:
      "Transform long videos into engaging short-form content with AI clipping, captions, and social media optimization.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* `theme-emerald` sits on <body>, not on each shell.
          Modal, ContextMenu and the language dropdown all createPortal into
          document.body, which is OUTSIDE any shell root — so with the class on
          the shells, every modal and popover in the app rendered in the light
          theme. Scoping bought nothing any more anyway: every surface is
          migrated, admin included. */}
      <body className="theme-emerald min-h-full flex flex-col bg-canvas text-on-canvas">
        {/* Renders nothing; reports Core Web Vitals to our own endpoint. */}
        <WebVitals />
        <QueryProvider>
          <AuthProvider>
            {children}
            <AuthModal />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

