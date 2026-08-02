import type { Metadata } from "next";
import LegalPage from "@/app/components/LegalPage";
import { getLegalDoc } from "@/app/legal/documents";
import type { LegalDoc } from "@/app/legal/types";

const doc: LegalDoc = {
  ...getLegalDoc("/affiliate-tos"),
  intro: (
    <>
      <p>
        These Affiliate Terms of Service (&quot;Affiliate Terms&quot;) govern your participation in the Clipiro
        Affiliate Program (the &quot;Program&quot;). By applying to or participating in the Program, you
        (&quot;Affiliate&quot;, &quot;you&quot;, or &quot;your&quot;) agree to be bound by these Affiliate Terms, our{" "}
        <a href="/terms">Terms of Service</a>, and our <a href="/privacy">Privacy Policy</a>, all of which are
        incorporated by reference.
      </p>
      <p>
        If you do not agree to these Affiliate Terms, you must not participate in the Program. Clipiro reserves the
        right to accept or reject any affiliate application at its sole discretion.
      </p>
    </>
  ),
  sections: [
    {
      id: "introduction",
      title: "Introduction",
      body: (
        <p>
          The Clipiro Affiliate Program allows approved partners to earn commissions by referring new paying customers
          to Clipiro. When someone signs up and makes a qualifying purchase through your unique referral link, you earn
          a commission on that transaction. The Program is designed to reward genuine promotion of our platform to
          audiences who would genuinely benefit from our Service.
        </p>
      ),
    },
    {
      id: "enrollment",
      title: "Enrollment in the Program",
      body: (
        <>
          <p>To join the Program, you must:</p>
          <ul>
            <li>
              Submit an affiliate application through our official affiliate portal or by contacting{" "}
              <a href="mailto:hello@clipiro.com">hello@clipiro.com</a>
            </li>
            <li>Have an active Clipiro account in good standing</li>
            <li>
              Own or control a website, social media channel, newsletter, or other promotional platform with original
              content
            </li>
            <li>Comply with all applicable laws and advertising regulations in your jurisdiction</li>
            <li>Be at least 18 years of age</li>
          </ul>
          <p>
            Upon approval, you will receive a unique referral link and access to our affiliate dashboard. Approval is at
            our sole discretion, and we may decline applications without providing a reason.
          </p>
        </>
      ),
    },
    {
      id: "obligations",
      title: "Affiliate Obligations",
      body: (
        <>
          <p>As a Clipiro Affiliate, you agree to:</p>
          <ul>
            <li>
              Promote Clipiro honestly, accurately, and in compliance with all applicable advertising laws and platform
              policies
            </li>
            <li>
              Clearly and conspicuously disclose your affiliate relationship with Clipiro in all promotional content, in
              accordance with applicable consumer protection and advertising disclosure requirements (e.g., FTC
              guidelines, ASA rules)
            </li>
            <li>Only make claims about Clipiro that are accurate and substantiated</li>
            <li>Not misrepresent Clipiro&apos;s features, pricing, or capabilities</li>
            <li>Maintain the reputation and goodwill of the Clipiro brand</li>
            <li>
              Promptly update or remove promotional content if notified by Clipiro that it is inaccurate or
              non-compliant
            </li>
            <li>Keep your affiliate account credentials secure and not share them with third parties</li>
          </ul>
        </>
      ),
    },
    {
      id: "approved-methods",
      title: "Approved Promotional Methods",
      body: (
        <>
          <p>You may promote Clipiro through the following channels:</p>
          <ul>
            <li>Your own website, blog, or online publication with original content</li>
            <li>
              YouTube, Instagram, Twitter/X, LinkedIn, and other social media platforms where you have a genuine
              following
            </li>
            <li>Email newsletters to your own opted-in subscriber list (no purchased or rented lists)</li>
            <li>Podcast episodes and video content featuring honest reviews or tutorials</li>
            <li>Search engine marketing (SEM) — subject to the keyword restrictions below</li>
            <li>Comparison or review articles where Clipiro is one of multiple products assessed</li>
          </ul>
          <p>
            If you are unsure whether a specific promotional method is permitted, email us at{" "}
            <a href="mailto:hello@clipiro.com">hello@clipiro.com</a> before proceeding.
          </p>
        </>
      ),
    },
    {
      id: "prohibited",
      title: "Prohibited Activities",
      body: (
        <>
          <p>
            The following activities are strictly prohibited and may result in immediate removal from the Program and
            forfeiture of any unpaid commissions:
          </p>
          <ul>
            <li>
              Using your own referral link to make purchases on your own account or creating fake accounts to generate
              commissions (self-referral fraud)
            </li>
            <li>Cookie stuffing, click spamming, or any form of forced or fraudulent cookie placement</li>
            <li>
              Bidding on branded keywords (&quot;Clipiro&quot;, &quot;Clipiro AI&quot;, or similar variations) in paid
              search without prior written permission
            </li>
            <li>
              Creating websites, social media profiles, or email addresses that impersonate or could be confused with
              Clipiro&apos;s official presence
            </li>
            <li>Using Clipiro&apos;s trademarks, logos, or brand assets in domain names or usernames</li>
            <li>Sending unsolicited bulk emails (spam) to promote Clipiro</li>
            <li>Making false or misleading claims about Clipiro&apos;s features, results, or pricing</li>
            <li>Offering unauthorised cashback, discounts, or incentives beyond what Clipiro officially provides</li>
            <li>
              Promoting Clipiro through adult content sites, gambling sites, or any platform that violates our Terms of
              Service
            </li>
            <li>Incentivised clicks or signups that do not represent genuine user interest</li>
            <li>
              Sub-affiliating or sharing your referral link with third-party affiliate networks without written consent
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "commission",
      title: "Commission & Payment",
      body: (
        <>
          <h3>Commission Rates</h3>
          <p>
            The current commission structure is communicated to approved affiliates through the affiliate dashboard and
            may be updated from time to time with advance notice. Commissions are calculated as a percentage of the net
            revenue (excluding taxes, payment gateway fees, and refunds) from qualifying purchases made by referred
            customers, capped at ₹2,000 per referral.
          </p>
          <p>
            A purchase is &quot;qualifying&quot; if: (a) the referred user signed up using your unique referral link;
            (b) the purchase was not later refunded; and (c) the purchase was not made fraudulently or in violation of
            these Affiliate Terms.
          </p>

          <h3>Payment Schedule</h3>
          <p>
            Each commission is held for 30 days after the referred purchase (to allow time for refund processing) before
            becoming available for payout. Once your available balance meets the minimum threshold, you may request a
            payout; payouts are processed manually by our team, typically within a few business days of your request.
          </p>
          <p>
            Payments are made via bank transfer (NEFT/RTGS/IMPS) for Indian affiliates, or PayPal / wire transfer for
            international affiliates. You are responsible for providing accurate payment details. Clipiro is not liable
            for payments made to incorrect details you provide.
          </p>

          <h3>Minimum Payout</h3>
          <p>
            A minimum balance of ₹500 (or equivalent) must be accumulated before a payout is initiated. If your balance
            does not meet the threshold, it carries over to the next payment period. Commission balances for terminated
            affiliates will be paid out at the next scheduled payment date, provided the minimum threshold is met and no
            violations have been identified.
          </p>

          <h3>Taxes</h3>
          <p>
            You are responsible for all taxes applicable to commissions you receive. Clipiro will provide necessary
            documentation (such as TDS certificates where applicable under Indian tax law) upon request. You agree to
            provide any tax information we reasonably request to comply with our own tax obligations.
          </p>
        </>
      ),
    },
    {
      id: "tracking",
      title: "Tracking & Attribution",
      body: (
        <p>
          Referrals are tracked via a unique link assigned to your account. Attribution is first-click based with a
          30-day cookie window — if a referred user completes a purchase within 30 days of clicking your link, the
          commission is attributed to you. We use industry-standard tracking and make every effort to ensure accurate
          attribution, but we cannot guarantee tracking in all circumstances (e.g., if a user clears cookies or uses an
          ad blocker). Disputed tracking issues must be raised within 14 days of the relevant payment period via{" "}
          <a href="mailto:hello@clipiro.com">hello@clipiro.com</a>.
        </p>
      ),
    },
    {
      id: "termination",
      title: "Term & Termination",
      body: (
        <>
          <p>
            These Affiliate Terms are effective from the date of your acceptance and continue until terminated by either
            party. You may exit the Program at any time by notifying us in writing. Clipiro may terminate your
            participation at any time, with or without cause, upon written notice. Grounds for immediate termination
            without notice include: fraud, violation of the prohibited activities listed above, or conduct that damages
            Clipiro&apos;s reputation.
          </p>
          <p>
            Upon termination, you must immediately cease using Clipiro&apos;s brand assets and remove all affiliate
            links from your promotional channels. Commissions already earned and approved prior to termination will be
            paid at the next scheduled payment date, unless termination was due to fraud or material breach, in which
            case all unpaid commissions may be forfeited.
          </p>
        </>
      ),
    },
    {
      id: "relationship",
      title: "Relationship of Parties",
      body: (
        <p>
          You and Clipiro are independent contractors. Nothing in these Affiliate Terms creates a partnership, joint
          venture, agency, franchise, or employment relationship. You have no authority to make representations,
          commitments, or obligations on behalf of Clipiro. You are responsible for your own business expenses and
          obligations, including taxes and insurance.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Limitation of Liability",
      body: (
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CLIPIRO&apos;S TOTAL LIABILITY TO YOU UNDER OR IN
          CONNECTION WITH THESE AFFILIATE TERMS SHALL NOT EXCEED THE TOTAL COMMISSIONS PAID TO YOU IN THE THREE MONTHS
          PRECEDING THE CLAIM. CLIPIRO SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE
          DAMAGES ARISING FROM YOUR PARTICIPATION IN THE PROGRAM.
        </p>
      ),
    },
    {
      id: "disclaimers",
      title: "Disclaimers",
      body: (
        <>
          <p>
            THE PROGRAM IS PROVIDED &quot;AS IS&quot;. CLIPIRO MAKES NO WARRANTIES, EXPRESS OR IMPLIED, REGARDING THE
            PROGRAM, INCLUDING ANY WARRANTY THAT THE PROGRAM WILL GENERATE ANY PARTICULAR LEVEL OF INCOME OR RESULTS FOR
            YOU. PAST COMMISSION EARNINGS BY OTHER AFFILIATES ARE NOT A GUARANTEE OF YOUR FUTURE EARNINGS.
          </p>
          <p>
            Clipiro reserves the right to modify pricing, credit packs, or the Service at any time, which may affect the
            volume or value of future commissions. Such changes do not entitle you to any compensation.
          </p>
        </>
      ),
    },
    {
      id: "modification",
      title: "Modification",
      body: (
        <p>
          Clipiro may modify these Affiliate Terms at any time by posting the updated terms on our website and notifying
          active affiliates via email with at least 14 days&apos; notice before the changes take effect. Your continued
          participation in the Program after the effective date constitutes acceptance of the revised terms. If you do
          not agree to the revised terms, you must exit the Program before the effective date.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Contact Us",
      body: (
        <>
          <p>For all affiliate programme enquiries, applications, or disputes:</p>
          <ul>
            <li>
              <strong>Affiliate inquiries:</strong> <a href="mailto:hello@clipiro.com">hello@clipiro.com</a>
            </li>
            <li>
              <strong>General support:</strong> <a href="mailto:support@clipiro.com">support@clipiro.com</a>
            </li>
          </ul>
          <p>We aim to respond to all affiliate queries within 3 business days.</p>
        </>
      ),
    },
  ],
};

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
};

export default function AffiliateTosPage() {
  return <LegalPage {...doc} />;
}
