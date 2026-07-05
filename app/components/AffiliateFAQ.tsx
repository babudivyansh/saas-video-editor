"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/app/components/landing/icons";

const FAQS = [
  {
    q: "How much can I earn?",
    a: "You earn 20% commission every time someone you refer makes their first payment on Clipiro. There's no cap on how many people you can refer or how much you can earn.",
  },
  {
    q: "Who can join the affiliate program?",
    a: "Anyone with an active Clipiro account who is at least 18 years old and owns or controls a website, social media channel, newsletter, or other platform with genuine original content. Applications are reviewed and approved at Clipiro's discretion.",
  },
  {
    q: "How do I get my referral link?",
    a: "Sign in to Clipiro and open the Affiliate Program from your dashboard. You'll get a unique referral link and code you can share anywhere.",
  },
  {
    q: "How is my referral tracked?",
    a: "We use last-click attribution with a 30-day cookie window. If someone clicks your link and makes a qualifying purchase within 30 days, the commission is credited to you.",
  },
  {
    q: "When and how do I get paid?",
    a: "Commissions are calculated monthly, 30 days in arrears to allow time for refund processing, and paid out by the 15th of the following month once your available balance reaches ₹500. Indian affiliates are paid via bank transfer (NEFT/RTGS/IMPS); international affiliates via PayPal or wire transfer.",
  },
  {
    q: "What promotional methods are allowed?",
    a: "Your own website or blog, social media platforms where you have a genuine following, opted-in email newsletters, podcasts, and honest review or comparison content. Spam, cookie stuffing, bidding on Clipiro's branded keywords, and brand impersonation are not allowed.",
  },
  {
    q: "Is there a minimum payout?",
    a: "Yes — a minimum balance of ₹500 must be accumulated before a payout is processed. If you're under the threshold, your balance simply rolls over to the next payment period.",
  },
  {
    q: "Where can I read the full legal terms?",
    a: "The complete rules, obligations, and payment terms are in our Affiliate Terms of Service, which every affiliate agrees to when joining the program.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-gray-100 bg-white transition-colors hover:border-gray-200">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-semibold text-gray-900">{q}</span>
        <ChevronDownIcon className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm leading-relaxed text-gray-600">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function AffiliateFAQ() {
  return (
    <div className="mx-auto mt-12 max-w-3xl space-y-3">
      {FAQS.map((f) => (
        <FaqItem key={f.q} q={f.q} a={f.a} />
      ))}
    </div>
  );
}
