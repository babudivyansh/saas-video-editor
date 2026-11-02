// One implementation of the application/ld+json script tag, used by every
// page that renders structured data, instead of each repeating the same
// <script type="application/ld+json" dangerouslySetInnerHTML=.../> boilerplate.
//
// No CSP nonce, and deliberately no headers() read: an ld+json block is a data
// block the browser never executes, so script-src doesn't govern it with or
// without a nonce. Reading the x-nonce request header here used to opt every
// page that carries structured data (home, tools, blog, pricing, reviews) into
// per-request rendering, so Hostinger's CDN could cache none of them — every
// marketing hit was a full SSR with `Cache-Control: private, no-store`.

// Structured data embeds user-written text (review titles/bodies, author
// names). JSON.stringify leaves `<` alone, so a value containing `</script>`
// would close the tag and run whatever follows it. Escaping every `<` as
// < parses to the identical JSON but can't break out of the element.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
