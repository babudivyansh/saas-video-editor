import { getPublicPlans, type PublicPlan } from "@/lib/plans/public";
import { JsonLd } from "@/app/components/JsonLd";
import { logger } from "@/lib/logger";
import PricingClient from "./PricingClient";
import type { DbPlan } from "./_components/types";

// Plans are rendered on the server so the prices are in the HTML: the page
// used to fetch them after hydration, which meant crawlers (and anyone on a
// slow connection) saw four skeleton cards and no prices at all.
//
// ISR-cached rather than rendered per request: force-dynamic sent
// `private, no-store`, so /pricing was the one public page the CDN and
// crawlers could never cache. Admin plan writes call revalidatePath("/pricing")
// (app/api/admin/plans), so a price change still shows on the next visit; the
// timer below is only a backstop. If the database is unreachable the page
// still renders, with an empty list the client then fetches itself (and
// offers a retry if that fails too).

async function loadPlans(): Promise<PublicPlan[]> {
  try {
    return await getPublicPlans();
  } catch (e) {
    logger.warn("pricing", "plans unavailable at render — client will fetch", { reason: (e as Error).message });
    return [];
  }
}

// Without a revalidate window this page would prerender once at build time
// with whatever prices (or none) the build saw, and keep them forever.
export const revalidate = 300;

export default async function PricingPage() {
  const plans = await loadPlans();
  const subscriptions = plans.filter((p) => p.kind === "subscription");

  return (
    <>
      {subscriptions.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            // SoftwareApplication, not Product: Google reads a Product with
            // Offers as a merchant listing and flags the shipping and return
            // fields a subscription can never have.
            "@type": "SoftwareApplication",
            name: "Clipiro",
            description: "AI video clipping — turn long videos into captioned short-form clips.",
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Web",
            url: "https://clipiro.com",
            publisher: { "@id": "https://clipiro.com/#organization" },
            offers: subscriptions.map((p) => {
              const price = (p.priceInPaise / 100).toFixed(2);
              return {
                "@type": "Offer",
                name: p.name,
                price,
                priceCurrency: "INR",
                priceSpecification: {
                  "@type": "UnitPriceSpecification",
                  price,
                  priceCurrency: "INR",
                  billingDuration: `P${p.intervalMonths}M`,
                },
                availability: "https://schema.org/InStock",
                url: "https://clipiro.com/pricing",
              };
            }),
          }}
        />
      )}
      <PricingClient initialPlans={plans as unknown as DbPlan[]} />
    </>
  );
}
