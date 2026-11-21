import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing: AI Clip Maker Plans and Clip Minutes",
  description:
    "Start free, no card. AutoClip is billed in Clip Minutes, one per minute of source video, and the other AI tools share one credit balance.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
