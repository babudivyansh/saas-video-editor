import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Clipiro team — support, billing questions, partnerships, and feedback.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
