import type { Metadata } from "next";

// Open Graph + Twitter card metadata for a marketing page.
//
// Next.js replaces a parent's `openGraph` object instead of merging it, so a
// page that sets only { title, description } silently drops the root layout's
// og:image, og:url and og:site_name — /about, /blog and /reviews all shared
// with no preview image until 2026-11. The same goes for `twitter`, whose
// title fell back to the homepage's. Every page that customises either goes
// through here so the image and URL can't be forgotten again.
//
// Routes with their own opengraph-image.tsx (blog posts, tool pages) don't
// need this: a file-based image wins over the config one.

export const DEFAULT_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Clipiro" };

export function socialMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  /** Site-relative canonical path, e.g. "/about". */
  path: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "Clipiro",
      title,
      description,
      url: path,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      site: "@ClipiroOfficial",
      title,
      description,
    },
  };
}
