import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Pages also carry their own noindex; a disallow alone doesn't stop a
      // linked URL being indexed, it only stops the crawl.
      disallow: ["/dashboard/", "/api/", "/admin/", "/report/", "/login", "/register", "/reset-password", "/change-email-confirm"],
    },
    sitemap: "https://clipiro.com/sitemap.xml",
  };
}
