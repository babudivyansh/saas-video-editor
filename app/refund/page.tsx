import type { Metadata } from "next";
import LegalPage from "@/app/components/LegalPage";
import { getLegalDoc } from "@/app/legal/documents";
import type { LegalDoc } from "@/app/legal/types";

const doc: LegalDoc = {
  ...getLegalDoc("/refund"),
  intro: (
    <p>
      At Clipiro, we want you to be satisfied with your purchase. This Refund Policy explains when and how you may
      request a refund for credit packs purchased on our platform. Please read this policy carefully before making a
      purchase.
    </p>
  ),
  sections: [
    {
      id: "overview",
      title: "Overview",
      body: (
        <p>
          Clipiro operates on a credit-based system. Credits are used to generate videos — each video generation
          consumes one credit. Because our costs (AI API calls, compute, and storage) are incurred at the moment a
          video is generated, our refund policy distinguishes between credits that have been used and those that remain
          unused.
        </p>
      ),
    },
    {
      id: "free-credits",
      title: "Free Credits",
      body: (
        <p>
          Free accounts receive a monthly grant of bonus credits, which expire 30 days after they are issued. Free
          credits are non-refundable and have no monetary value. They cannot be exchanged for cash or transferred to
          another account.
        </p>
      ),
    },
    {
      id: "paid-credits",
      title: "Paid Plans and Credit Packs",
      body: (
        <>
          <p>
            Credits can be obtained two ways. A <strong>subscription</strong> (Creator, Pro or Studio, billed monthly or
            yearly) grants an allowance of credits that refills each month and renews automatically until cancelled.
            A <strong>credit pack</strong> is a one-time purchase with no recurring charge.
          </p>
          <p>
            Current plan names, credit allowances and prices are listed on our{" "}
            <a href="/pricing">Pricing page</a>, which always reflects live pricing.
          </p>
          <p>
            Subscription credits refill monthly and roll over up to twice your monthly allowance; unused credits beyond
            that cap do not carry forward, and subscription credits are cleared if the subscription lapses. Credits from
            packs never expire and remain on your account even if a subscription ends.
          </p>
        </>
      ),
    },
    {
      id: "eligible",
      title: "When You Are Eligible for a Refund",
      body: (
        <>
          <p>You may be eligible for a full or partial refund in the following circumstances:</p>
          <ul>
            <li>
              <strong>Technical failure:</strong> A credit was deducted from your account but no video was generated due
              to a confirmed error on our platform (not a third-party API failure outside our control). We will either
              restore the credit or issue a refund for the value of that credit.
            </li>
            <li>
              <strong>Duplicate charge:</strong> You were charged more than once for the same credit pack due to a
              payment processing error.
            </li>
            <li>
              <strong>Purchase within 48 hours with zero usage:</strong> If you purchased a credit pack within the past
              48 hours and have not used any of the purchased credits (free credits may have been used), you may request
              a full refund.
            </li>
            <li>
              <strong>Unauthorised transaction:</strong> If a purchase was made on your account without your
              authorisation, please contact us immediately with supporting evidence.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "not-eligible",
      title: "When You Are Not Eligible for a Refund",
      body: (
        <>
          <p>Refunds will not be issued in the following circumstances:</p>
          <ul>
            <li>Credits that have already been used to generate videos</li>
            <li>
              Dissatisfaction with the quality of AI-generated output (scripts, voiceovers, or video rendering)
            </li>
            <li>Change of mind after more than 48 hours of purchase</li>
            <li>Account termination due to violation of our Terms of Service</li>
            <li>Failure to use credits before account deactivation initiated by the user</li>
            <li>Requests made more than 14 days after the purchase date</li>
            <li>Free credits provided at registration or through promotions</li>
          </ul>
          <p>
            We encourage all users to test the Service using their 30 free starter credits before purchasing a credit
            pack.
          </p>
        </>
      ),
    },
    {
      id: "process",
      title: "How to Request a Refund",
      body: (
        <>
          <p>To request a refund, please follow these steps:</p>
          <ul>
            <li>
              Email us at <a href="mailto:support@clipiro.com">support@clipiro.com</a> with the subject line:{" "}
              <strong>&quot;Refund Request — [your registered email]&quot;</strong>
            </li>
            <li>Include your registered email address and the date of purchase</li>
            <li>Include the Razorpay order ID or payment reference number from your receipt</li>
            <li>Briefly describe the reason for your refund request</li>
          </ul>
          <p>
            Our support team will review your request and respond within 3 business days. Approved refunds will be
            issued to the original payment method used at checkout.
          </p>
        </>
      ),
    },
    {
      id: "processing",
      title: "Processing Time",
      body: (
        <>
          <p>Once a refund is approved, processing times depend on your payment method:</p>
          <ul>
            <li>
              <strong>UPI:</strong> 1–3 business days
            </li>
            <li>
              <strong>Credit/Debit card:</strong> 5–10 business days (depending on your bank)
            </li>
            <li>
              <strong>Net banking:</strong> 3–7 business days
            </li>
            <li>
              <strong>Wallets (Paytm, PhonePe, etc.):</strong> 1–3 business days
            </li>
          </ul>
          <p>
            Refunds are processed through Razorpay back to the original payment source. Clipiro is not responsible for
            delays caused by your bank or payment provider.
          </p>
        </>
      ),
    },
    {
      id: "payment-failures",
      title: "Payment Failures",
      body: (
        <p>
          If your payment fails but an amount was debited from your account, it will typically be auto-reversed by your
          bank within 5–7 business days. If no auto-reversal occurs after 7 business days, please contact your bank with
          the failed transaction reference and also notify us at{" "}
          <a href="mailto:support@clipiro.com">support@clipiro.com</a> so we can assist.
        </p>
      ),
    },
    {
      id: "subscription",
      title: "No Subscription Model",
      body: (
        <p>
          Clipiro does not offer subscription plans. All purchases are one-time credit pack transactions. There are no
          recurring charges, no auto-renewals, and no hidden fees. You will only be charged when you explicitly purchase
          a credit pack.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes to This Policy",
      body: (
        <p>
          We reserve the right to update this Refund Policy at any time. Changes will be posted on this page with an
          updated &quot;Last updated&quot; date. Material changes will be communicated via email. Purchases made before
          the effective date of any changes will be governed by the policy in effect at the time of purchase.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Contact Us",
      body: (
        <>
          <p>For all refund-related queries, please reach out to our support team:</p>
          <ul>
            <li>
              <strong>Email:</strong> <a href="mailto:support@clipiro.com">support@clipiro.com</a>
            </li>
            <li>
              <strong>Response time:</strong> Within 3 business days
            </li>
          </ul>
          <p>
            We are committed to resolving all refund requests fairly and promptly. If you have a concern that our
            support team cannot resolve, you may also raise a dispute through your payment provider or Razorpay.
          </p>
        </>
      ),
    },
  ],
};

export const metadata: Metadata = {
  title: doc.title,
  description: "When and how refunds apply to Clipiro credit packs and subscriptions.",
};

export default function RefundPage() {
  return <LegalPage {...doc} />;
}
