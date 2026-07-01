import { PricingCard } from "@clipiro/ui";

export function ThreeTierPlan() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(200px, 1fr))", gap: 20 }}>
      <PricingCard
        name="Creator"
        price="₹799"
        subtitle="50 credits / month"
        features={["50 credits / month", "All AI tools", "1080p exports"]}
        ctaLabel="Get Creator"
      />
      <PricingCard
        name="Pro"
        price="₹1,799"
        subtitle="140 credits / month"
        features={["140 credits / month", "All AI tools", "Priority rendering"]}
        highlighted
        badgeLabel="Most Popular"
        ctaLabel="Get Pro"
      />
      <PricingCard
        name="Studio"
        price="₹3,999"
        subtitle="340 credits / month"
        features={["340 credits / month", "Priority rendering", "Dedicated support"]}
        ctaLabel="Get Studio"
      />
    </div>
  );
}

export function Highlighted() {
  return (
    <div style={{ maxWidth: 320 }}>
      <PricingCard
        name="Pro"
        price="₹1,799"
        subtitle="140 credits / month"
        features={["140 credits / month", "All AI tools", "Priority rendering", "Save 20% vs monthly"]}
        highlighted
        badgeLabel="Most Popular"
        ctaLabel="Get Pro"
      />
    </div>
  );
}
