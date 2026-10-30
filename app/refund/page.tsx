import type { Metadata } from "next";
import LegalPage from "@/app/components/LegalPage";
import { getLegalDoc } from "@/app/legal/documents";
import type { LegalDoc } from "@/app/legal/types";
import {
  BONUS_MINUTES_EXPIRY_DAYS,
  FREE_TIER_MONTHLY_BONUS_CREDITS,
  FREE_TIER_MONTHLY_BONUS_MINUTES,
  FREE_TIER_SIGNUP_MINUTES,
  SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER,
} from "@/lib/plans/tiers";
import { MONEY_BACK_DAYS } from "@clipiro/shared";

// The numbers below come from the constants that enforce them, so the policy
// can't drift from the product again. (Until 2026-10-30 this page said Clipiro
// had no subscriptions at all, months after they launched.)

const doc: LegalDoc = {
  ...getLegalDoc("/refund"),
  intro: (
    <p>
      This Refund Policy explains how subscriptions renew and cancel, and when you can get your money back for a
      subscription, a Clip Minutes pack or a credit pack. Please read it before you buy.
    </p>
  ),
  sections: [
    {
      id: "overview",
      title: "What You Can Buy",
      body: (
        <>
          <p>
            Clipiro uses two balances: <strong>Clip Minutes</strong>, which Auto Clips and auto-captions use, and{" "}
            <strong>AI credits</strong>, which the other AI tools use. You can get them three ways:
          </p>
          <ul>
            <li>
              <strong>A subscription</strong> (Lite, Creator, Pro or Studio), billed monthly or yearly. It gives you a
              monthly allowance of Clip Minutes and credits and renews automatically until you cancel.
            </li>
            <li>
              <strong>A Clip Minutes pack</strong>, a one-time purchase with no recurring charge.
            </li>
            <li>
              <strong>A credit pack</strong>, a one-time purchase with no recurring charge.
            </li>
          </ul>
          <p>
            Current plans, allowances and prices are on our <a href="/pricing">Pricing page</a>, which always shows live
            pricing. Prices in ₹ include GST.
          </p>
          <p>
            Because our costs (AI provider calls, compute and storage) are incurred when a job runs, this policy treats
            minutes and credits you have used differently from those you have not.
          </p>
        </>
      ),
    },
    {
      id: "free-credits",
      title: "Free Minutes and Credits",
      body: (
        <p>
          A new account starts with {FREE_TIER_SIGNUP_MINUTES} Clip Minutes. After that, free accounts get{" "}
          {FREE_TIER_MONTHLY_BONUS_MINUTES} Clip Minutes and {FREE_TIER_MONTHLY_BONUS_CREDITS} credits a month. Free
          minutes and credits expire {BONUS_MINUTES_EXPIRY_DAYS} days after they are issued, have no monetary value, are
          not refundable and cannot be transferred.
        </p>
      ),
    },
    {
      id: "subscriptions",
      title: "Subscriptions: Renewal and Cancellation",
      body: (
        <>
          <ul>
            <li>
              <strong>Automatic renewal.</strong> A subscription renews at the end of each billing period (every month or
              every year) through the UPI Autopay or card mandate you approve at checkout, until you cancel.
            </li>
            <li>
              <strong>Cancel any time.</strong> Cancel from Billing in your account settings. Cancelling stops the next
              renewal. You keep your plan until the end of the period you have paid for, and there is no cancellation
              fee.
            </li>
            <li>
              <strong>Reminders.</strong> We email you 7, 3 and 1 day before your plan renews or ends.
            </li>
            <li>
              <strong>Yearly renewals over ₹15,000.</strong> Under RBI rules, a mandate payment above ₹15,000 needs your
              approval. For these plans your bank asks you to approve the renewal (a UPI or card OTP request). If you
              don&apos;t approve it, the plan ends at the end of the term.
            </li>
            <li>
              <strong>Monthly allowance.</strong> Subscription minutes and credits refill each month and roll over up to{" "}
              {SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER}× your monthly allowance. Anything above that cap does not carry
              forward. Subscription minutes and credits are removed when the subscription ends. Pack minutes and credits
              never expire and stay on your account.
            </li>
            <li>
              <strong>Changing plan.</strong> Switching to another plan starts a new term on that plan from the day you
              switch. Minutes and credits already in your account come with you. If you leave a yearly plan with paid
              months still to come, we add their value to your account as Clip Minutes that never expire, priced at our
              300-minute pack rate. Switching is not refunded in money.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "eligible",
      title: "When You Can Get a Refund",
      body: (
        <>
          <p>You can request a full refund in these cases:</p>
          <ul>
            <li>
              <strong>A new subscription, within {MONEY_BACK_DAYS} days.</strong> You bought a subscription in the last{" "}
              {MONEY_BACK_DAYS} days (72 hours) and have not used any of the minutes or credits it gave you.
            </li>
            <li>
              <strong>A renewal you didn&apos;t mean to keep, within {MONEY_BACK_DAYS} days.</strong> Your subscription
              renewed in the last {MONEY_BACK_DAYS} days and you have not used any of that period&apos;s minutes or
              credits.
            </li>
            <li>
              <strong>A pack, within {MONEY_BACK_DAYS} days.</strong> You bought a Clip Minutes pack or credit pack in
              the last {MONEY_BACK_DAYS} days and have not used any of it. Free minutes and credits may have been used.
            </li>
            <li>
              <strong>A technical failure.</strong> Minutes or credits were taken but no result was delivered because of
              an error on our side. Failed Auto Clips and exports are refunded to your balance automatically. If one
              wasn&apos;t, we restore it or refund its value.
            </li>
            <li>
              <strong>A duplicate charge.</strong> You were charged more than once for the same purchase because of a
              payment error.
            </li>
            <li>
              <strong>An unauthorised payment.</strong> A purchase was made on your account without your permission.
              Contact us straight away with any evidence you have.
            </li>
          </ul>
          <p>
            We may also offer a partial refund in other situations at our discretion. A partial refund removes the same
            share of the minutes and credits that payment gave you.
          </p>
        </>
      ),
    },
    {
      id: "what-happens",
      title: "What Happens When a Payment Is Refunded",
      body: (
        <ul>
          <li>
            The minutes and credits that payment gave you are removed from your balance (never below zero).
          </li>
          <li>
            If you are refunded the charge for your current subscription, the plan ends immediately and will not renew.
            Your account moves to the free plan.
          </li>
          <li>Your projects, clips and uploads stay in your account.</li>
        </ul>
      ),
    },
    {
      id: "not-eligible",
      title: "When We Don't Refund",
      body: (
        <>
          <ul>
            <li>Minutes or credits that have already been used</li>
            <li>Unused time left in a subscription period after the {MONEY_BACK_DAYS}-day window (cancel to stop the next renewal instead)</li>
            <li>Dissatisfaction with the creative quality of AI output, where the job itself completed</li>
            <li>Requests made more than 14 days after the payment</li>
            <li>Accounts closed for breaking our Terms of Service</li>
            <li>Free minutes and credits, including those from signup, quests or promotions</li>
          </ul>
          <p>
            Every new account gets free Clip Minutes and credits, so you can try Auto Clips and the AI tools before you
            pay.
          </p>
        </>
      ),
    },
    {
      id: "process",
      title: "How to Request a Refund",
      body: (
        <>
          <p>Email <a href="mailto:support@clipiro.com">support@clipiro.com</a> with:</p>
          <ul>
            <li>
              The subject line <strong>&quot;Refund Request — [your registered email]&quot;</strong>
            </li>
            <li>Your registered email address and the date of the payment</li>
            <li>The Razorpay payment ID or invoice number from your receipt</li>
            <li>A short reason for the request</li>
          </ul>
          <p>
            We reply within 3 business days. Approved refunds go back to the payment method you used.
          </p>
        </>
      ),
    },
    {
      id: "processing",
      title: "Processing Time",
      body: (
        <>
          <p>Once a refund is approved, how long it takes depends on your payment method:</p>
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
            Refunds are processed through Razorpay to the original payment source. We can&apos;t speed up delays caused
            by your bank or payment provider.
          </p>
        </>
      ),
    },
    {
      id: "payment-failures",
      title: "Failed Payments",
      body: (
        <>
          <p>
            If a payment fails but money left your account, your bank normally reverses it within 5–7 business days. If
            it hasn&apos;t after 7 business days, contact your bank with the transaction reference and let us know at{" "}
            <a href="mailto:support@clipiro.com">support@clipiro.com</a>.
          </p>
          <p>
            If a renewal fails, we email you and keep your plan active for a short grace period while the payment is
            retried. If it still fails, the plan ends and your account moves to the free plan.
          </p>
        </>
      ),
    },
    {
      id: "chargebacks",
      title: "Chargebacks",
      body: (
        <p>
          Please contact us before you dispute a payment with your bank. A refund through us is faster. If a chargeback
          is decided in your favour, the minutes, credits and plan that payment bought are removed, the same as for a
          refund.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes to This Policy",
      body: (
        <p>
          We may update this Refund Policy. Changes are posted on this page with a new &quot;Last updated&quot; date, and
          material changes are emailed to you. A purchase is covered by the policy that was in effect when you made it.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Contact Us",
      body: (
        <>
          <p>For any refund or billing question, contact our support team:</p>
          <ul>
            <li>
              <strong>Email:</strong> <a href="mailto:support@clipiro.com">support@clipiro.com</a>
            </li>
            <li>
              <strong>Response time:</strong> Within 3 business days
            </li>
          </ul>
          <p>
            If we can&apos;t resolve your concern, you can raise it with our Grievance Officer (see our{" "}
            <a href="/contact">Contact page</a>) or with your payment provider.
          </p>
        </>
      ),
    },
  ],
};

export const metadata: Metadata = {
  title: doc.title,
  description: "When and how refunds apply to Clipiro subscriptions, Clip Minutes packs and credit packs.",
  alternates: { canonical: doc.slug },
};

export default function RefundPage() {
  return <LegalPage {...doc} />;
}
