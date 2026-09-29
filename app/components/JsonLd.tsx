import { headers } from "next/headers";

// One implementation of the application/ld+json script tag, used by every
// page that renders structured data (16 call sites across 8 files), instead
// of each repeating the same <script type="application/ld+json"
// dangerouslySetInnerHTML=.../> boilerplate. The single point of control
// also means a CSP nonce only needs to be threaded through here once.
// Structured data embeds user-written text (review titles/bodies, author
// names). JSON.stringify leaves `<` alone, so a value containing `</script>`
// would close the tag and run whatever follows it. Escaping every `<` as
// < parses to the identical JSON but can't break out of the element.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export async function JsonLd({ data }: { data: unknown }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // The HTML spec requires browsers to blank a script/style/link's
      // reflected `nonce` CONTENT attribute back to "" the instant it's
      // parsed — specifically so an XSS payload injected right after can't
      // read a legitimate nonce off the DOM and reuse it. The real nonce is
      // still in the HTML source the browser validated against CSP; it's
      // just unreadable afterward. React's hydration diff sees "real value"
      // vs "DOM says empty" and can't tell that's expected, so it warns.
      // CSP enforcement is unaffected either way — it's decided at parse
      // time from the response, not from what's readable after the fact.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
