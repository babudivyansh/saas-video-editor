import { getPublicPlans, type PublicPlan } from "@/lib/plans/public";
import { JsonLd } from "@/app/components/JsonLd";
import { logger } from "@/lib/logger";
import PricingClient from "./PricingClient";
import type { DbPlan } from "./_components/types";

// Plans are rendered on the server so the prices are in the HTML: the page
// used to fetch them after hydration, which meant crawlers (and anyone on a
// slow connection) saw four skeleton cards and no prices at all.
//
// Rendered per request (JsonLd reads the per-request CSP nonce header), so an
// admin price change shows up immediately; it is two small indexed queries.
// If the database is unreachable the page still renders, with an empty list
// the client then fetches itself (and offers a retry if that fails too).

async function loadPlans(): Promise<PublicPlan[]> {
  try {
    return await getPublicPlans();
  } catch (e) {
    logger.warn("pricing", "plans unavailable at render — client will fetch", { reason: (e as Error).message });
    return [];
  }
}

export default async function PricingPage() {
  const plans = await loadPlans();
  const subscriptions = plans.filter((p) => p.kind === "subscription");

  return (
    <>
      {subscriptions.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Clipiro",
            description: "AI video clipping — turn long videos into captioned short-form clips.",
            brand: { "@type": "Brand", name: "Clipiro" },
            offers: subscriptions.map((p) => ({
              "@type": "Offer",
              name: p.name,
              price: (p.priceInPaise / 100).toFixed(2),
              priceCurrency: "INR",
              availability: "https://schema.org/InStock",
              url: "https://clipiro.com/pricing",
            })),
          }}
        />
      )}
      <PricingClient initialPlans={plans as unknown as DbPlan[]} />
    </>
  );
}
