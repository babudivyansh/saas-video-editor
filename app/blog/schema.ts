import type { BlogFaq, BlogPost } from "./types";

const SITE_URL = "https://clipiro.com";

export function buildBlogPostingSchema(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription,
    // Absolute URL required by schema.org. This is what Google Discover and
    // article rich results read, so it's the highest-value use of the hero.
    ...(post.hero && { image: [`${SITE_URL}${post.hero.src}`] }),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { "@type": "Organization", name: post.author.name, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "Clipiro",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/opengraph-image` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${post.slug}` },
  };
}

export function buildFaqPageSchema(faqs: BlogFaq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function buildBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/**
 * Defaults describe /blog itself; category pages pass overrides. The argument
 * is optional so the existing /blog call site needed no change.
 */
export function buildCollectionPageSchema(opts?: { name?: string; description?: string; path?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts?.name ?? "The Clipiro creator playbook",
    description:
      opts?.description ?? "Tutorials, growth tips, and product updates to help you go viral with short-form video.",
    url: `${SITE_URL}${opts?.path ?? "/blog"}`,
    isPartOf: { "@type": "WebSite", name: "Clipiro", url: SITE_URL },
  };
}
