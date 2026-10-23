import type { Metadata } from "next";
import LegalPage from "@/app/components/LegalPage";
import { getLegalDoc } from "@/app/legal/documents";
import type { LegalDoc } from "@/app/legal/types";
import CookiePreferences from "./CookiePreferences";

// Every cookie the app sets, by name. Keep in step with the code that sets
// them: lib/auth.ts (session, locale), app/api/auth/google (google_oauth_state),
// proxy.ts (affiliate_ref, mkt_attr), app/cookies/CookiePreferences.tsx
// (the two consent cookies). A cookie added anywhere else belongs here too.
const COOKIES: { name: string; purpose: string; duration: string }[] = [
  { name: "session", purpose: "Keeps you signed in. Holds a signed token, not your password.", duration: "7 days" },
  { name: "google_oauth_state", purpose: "Protects “Continue with Google” sign-in against forged requests.", duration: "10 minutes" },
  { name: "locale", purpose: "Remembers the language you chose for the app.", duration: "1 year" },
  { name: "cookie_consent_analytics", purpose: "Remembers your Analytics choice below.", duration: "1 year" },
  { name: "cookie_consent_marketing", purpose: "Remembers your Marketing choice below.", duration: "1 year" },
];

const MARKETING_COOKIES: { name: string; purpose: string; duration: string }[] = [
  {
    name: "affiliate_ref",
    purpose: "Records which affiliate link brought you here, so the affiliate is credited if you sign up.",
    duration: "30 days, cleared at sign-up",
  },
  {
    name: "mkt_attr",
    purpose: "Records the campaign (utm_source / medium / campaign) of your first visit, so we know which campaigns work.",
    duration: "30 days, cleared at sign-up",
  },
];

function CookieTable({ rows }: { rows: { name: string; purpose: string; duration: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-card-border">
      <table className="w-full min-w-[520px] text-left text-[14px]">
        <thead className="bg-surface-2 text-[12px] uppercase tracking-wider text-ink">
          <tr>
            <th className="px-4 py-3 font-semibold">Cookie</th>
            <th className="px-4 py-3 font-semibold">What it does</th>
            <th className="px-4 py-3 font-semibold">Lasts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-card-border align-top">
              <td className="px-4 py-3 font-mono text-[13px] text-ink">{r.name}</td>
              <td className="px-4 py-3">{r.purpose}</td>
              <td className="whitespace-nowrap px-4 py-3">{r.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const doc: LegalDoc = {
  ...getLegalDoc("/cookies"),
  intro: (
    <p>
      This policy lists every cookie Clipiro sets, what each one is for, and how to switch off the ones that are
      optional. We do not use advertising cookies, and we do not load third-party analytics or ad trackers.
    </p>
  ),
  sections: [
    {
      id: "what-are-cookies",
      title: "What Are Cookies",
      body: (
        <p>
          Cookies are small text files a website stores in your browser. Cookies set by Clipiro itself are
          &quot;first-party&quot; cookies. Cookies set by another company&apos;s service running on our pages are
          &quot;third-party&quot; cookies.
        </p>
      ),
    },
    {
      id: "strictly-necessary",
      title: "Strictly Necessary Cookies",
      body: (
        <>
          <p>
            These make sign-in and the app work. They are always on, because the site cannot work without them.
          </p>
          <CookieTable rows={COOKIES} />
        </>
      ),
    },
    {
      id: "marketing",
      title: "Marketing Cookies (optional)",
      body: (
        <>
          <p>
            These only record how you found us. They are never used to show you ads, here or on other sites. Switching
            Marketing off below stops both cookies being set, and also stops the anonymous button-click counts we use to
            see which pages lead to sign-ups.
          </p>
          <CookieTable rows={MARKETING_COOKIES} />
        </>
      ),
    },
    {
      id: "analytics",
      title: "Performance Measurement (optional)",
      body: (
        <p>
          With Analytics on, your browser sends anonymous page-speed measurements (Core Web Vitals) to our own server.
          This sets no cookie and carries nothing that identifies you. We do not use Google Analytics or any other
          third-party analytics service. Switching Analytics off below stops these measurements.
        </p>
      ),
    },
    {
      id: "third-party",
      title: "Third-Party Cookies",
      body: (
        <p>
          When you open checkout, our payment provider, Razorpay, loads its payment window. Razorpay may set its own
          cookies to process the payment and prevent fraud, under{" "}
          <a href="https://razorpay.com/privacy/" target="_blank" rel="noopener noreferrer">
            Razorpay&apos;s privacy policy
          </a>
          . No other third party sets cookies on Clipiro.
        </p>
      ),
    },
    {
      id: "manage-cookies",
      title: "Cookie Preferences",
      body: (
        <>
          <p>
            Choose which optional categories you allow. Both are on unless you switch them off here, and your choice is
            saved in this browser.
          </p>
          <CookiePreferences />
        </>
      ),
    },
    {
      id: "your-choices",
      title: "Browser Controls",
      body: (
        <p>
          You can also block or delete cookies in your browser settings. If you block strictly necessary cookies, you
          will not be able to sign in.
        </p>
      ),
    },
    {
      id: "updates-policy",
      title: "Policy Updates",
      body: (
        <p>
          If we add or change a cookie we will update this page and the &quot;Last updated&quot; date above.
        </p>
      ),
    },
    {
      id: "contact-us",
      title: "Contact Us",
      body: (
        <p>
          Questions about cookies? Email <a href="mailto:support@clipiro.com">support@clipiro.com</a>.
        </p>
      ),
    },
  ],
};

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Every cookie Clipiro sets, what it is for, and how to switch off the optional ones.",
  alternates: { canonical: doc.slug },
};

export default function CookiesPage() {
  return <LegalPage {...doc} />;
}
