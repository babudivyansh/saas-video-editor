import type { Metadata } from "next";
import { buildBreadcrumbSchema } from "@/app/blog/schema";
import { JsonLd } from "@/app/components/JsonLd";

export const metadata: Metadata = {
  title: { absolute: "Contact Clipiro: Support and General Inquiries" },
  description: "Get in touch with the Clipiro team — support, billing questions, partnerships, and feedback.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  // Breadcrumbs live here because page.tsx is a client component.
  return (
    <>
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
      {children}
    </>
  );
}
