import { LEGAL } from "@/lib/email/tokens";

/**
 * The seller disclosures Indian e-commerce rules require on the site: legal
 * entity, registered address, GSTIN and a Grievance Officer. Values come from
 * LEGAL in lib/email/tokens.ts — the same constants the email footer and the
 * GST invoice read — so the site can never disagree with an invoice.
 *
 * No hooks, so it renders inside server and client components alike.
 */

const { entity, address, gstin, grievanceOfficer } = LEGAL;

/** One-paragraph version for the site footer's bottom bar. */
export function BusinessDetailsLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12.5px] leading-relaxed text-fg-subtle ${className}`}>
      {entity} · {address} · GSTIN {gstin} · Grievance Officer: {grievanceOfficer.name},{" "}
      <a href={`mailto:${grievanceOfficer.email}`} className="transition-colors hover:text-emerald-bright">
        {grievanceOfficer.email}
      </a>
    </p>
  );
}

/**
 * Labelled list for /contact and the "Contact Us" section of legal pages.
 * Unstyled list items so it inherits LegalPage's prose styles.
 */
export function BusinessDetailsList({ className }: { className?: string }) {
  return (
    <ul className={className}>
      <li>
        <strong>Legal entity:</strong> {entity}
      </li>
      <li>
        <strong>Registered address:</strong> {address}
      </li>
      <li>
        <strong>GSTIN:</strong> {gstin}
      </li>
      <li>
        <strong>Grievance Officer:</strong> {grievanceOfficer.name},{" "}
        <a href={`mailto:${grievanceOfficer.email}`}>{grievanceOfficer.email}</a>
      </li>
    </ul>
  );
}

/** The grievance timeline promised under the Consumer Protection (E-Commerce) Rules 2020. */
export const GRIEVANCE_TIMELINE =
  "We acknowledge every grievance within 48 hours and resolve it within one month of receipt.";
