import { LEGAL } from "@/lib/email/tokens";

// The schema.org Organization and founder nodes, in one place so the homepage
// graph and /about can't describe two different companies. Identity comes from
// LEGAL (lib/email/tokens.ts), the same constants the footer disclosures and
// the GST invoice read.
//
// Deliberately absent: foundingDate (no registration date is recorded in the
// code) and personal profile links for the founder (none on file). Add them
// here when they exist — and add the Product Hunt / G2 / Crunchbase / Wikidata
// pages to ORGANIZATION_SAME_AS once those listings are live.

const SITE_URL = "https://clipiro.com";

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const FOUNDER_ID = `${SITE_URL}/about#founder`;

/** The profiles SiteFooter links to — what lets engines tie those accounts to the brand. */
export const ORGANIZATION_SAME_AS = [
  "https://x.com/ClipiroOfficial",
  "https://youtube.com/@clipiroofficial",
  "https://www.instagram.com/clipiroapp/",
  "https://www.linkedin.com/company/109881774",
  "https://www.facebook.com/profile.php?id=61593101997903",
];

/** "B1-1208, Futech Gateway, Sector-75, Noida, Uttar Pradesh 201301, India" → its parts. */
function postalAddress() {
  const parts = LEGAL.address.split(",").map((p) => p.trim());
  const [regionAndCode, country] = parts.slice(-2);
  const locality = parts.at(-3) ?? "";
  const street = parts.slice(0, -3).join(", ");
  const postalCode = regionAndCode.match(/\d{6}$/)?.[0];
  return {
    "@type": "PostalAddress",
    streetAddress: street,
    addressLocality: locality,
    addressRegion: regionAndCode.replace(/\s*\d{6}$/, ""),
    ...(postalCode && { postalCode }),
    addressCountry: country === "India" ? "IN" : country,
  };
}

export function buildFounderNode() {
  return {
    "@type": "Person",
    "@id": FOUNDER_ID,
    name: LEGAL.grievanceOfficer.name,
    jobTitle: "Founder & CEO",
    worksFor: { "@id": ORGANIZATION_ID },
    url: `${SITE_URL}/blog/author/divyansh-verma`,
  };
}

export function buildOrganizationNode() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "Clipiro",
    legalName: LEGAL.entity,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    description: "AI-powered tool that turns long videos into viral short-form clips.",
    address: postalAddress(),
    founder: { "@id": FOUNDER_ID },
    sameAs: ORGANIZATION_SAME_AS,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: LEGAL.supportEmail,
    },
  };
}
