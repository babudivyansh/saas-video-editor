import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple credit-based pricing for AI video clipping. Start free, upgrade when you grow — plans for creators, podcasters, and agencies.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
