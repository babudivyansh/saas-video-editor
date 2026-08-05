import { headers } from "next/headers";

// One implementation of the application/ld+json script tag, used by every
// page that renders structured data (16 call sites across 8 files), instead
// of each repeating the same <script type="application/ld+json"
// dangerouslySetInnerHTML=.../> boilerplate. The single point of control
// also means a CSP nonce only needs to be threaded through here once.
export async function JsonLd({ data }: { data: unknown }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
