import type { Metadata } from "next";
import LegalPage from "@/app/components/LegalPage";
import { getLegalDoc } from "@/app/legal/documents";
import type { LegalDoc } from "@/app/legal/types";
import CookiePreferences from "./CookiePreferences";

const doc: LegalDoc = {
  ...getLegalDoc("/cookies"),
  intro: (
    <p>
      This Cookies Policy explains how Clipiro (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) uses cookies and
      similar tracking technologies on our website. It outlines what these technologies are, why we use them, and your
      rights to control our use of them.
    </p>
  ),
  sections: [
    {
      id: "what-are-cookies",
      title: "What Are Cookies",
      body: (
        <>
          <p>
            Cookies are small data files that are placed on your computer or mobile device when you visit a website.
            They are widely used by website owners to make their websites work, or to work more efficiently, as well as
            to provide reporting information.
          </p>
          <p>
            Cookies set by the website owner (in this case, Clipiro) are called &quot;first-party cookies&quot;. Cookies
            set by parties other than the website owner are called &quot;third-party cookies&quot;. Third-party cookies
            enable third-party features or functionality to be provided on or through the website (e.g., interactive
            content, payment processing, and analytics).
          </p>
        </>
      ),
    },
    {
      id: "how-we-use",
      title: "How We Use Cookies",
      body: (
        <p>
          We use first-party and third-party cookies for several reasons. Some cookies are required for technical
          reasons in order for our website and editor to operate, and we refer to these as &quot;essential&quot; or
          &quot;strictly necessary&quot; cookies. Other cookies enable us to track and target the interests of our users
          to enhance the experience on our Online Platform.
        </p>
      ),
    },
    {
      id: "types-of-cookies",
      title: "Types of Cookies We Use",
      body: (
        <>
          <h3>1. Strictly Necessary Cookies</h3>
          <p>
            These cookies are essential to provide you with services available through our Website and to use some of
            its features, such as secure login sessions.
          </p>
          <ul>
            <li>
              <strong>Authentication:</strong> We use session cookies to keep you signed in while using the editor.
            </li>
            <li>
              <strong>Security:</strong> CSRF protection cookies to prevent cross-site request forgery attacks.
            </li>
          </ul>

          <h3>2. Performance &amp; Analytics Cookies</h3>
          <p>
            These cookies collect information that is used either in aggregate form to help us understand how our
            Website is being used or how effective our marketing campaigns are.
          </p>
          <ul>
            <li>
              <strong>Traffic Analysis:</strong> We track unique visitors, bounce rates, and popular templates to
              optimize load times and simplify the creation flow.
            </li>
          </ul>

          <h3>3. Marketing &amp; Advertising Cookies</h3>
          <p>
            These cookies are used to make advertising messages more relevant to you. They perform functions like
            preventing the same ad from continuously reappearing, ensuring that ads are properly displayed for
            advertisers, and selecting advertisements that are based on your interests.
          </p>
        </>
      ),
    },
    {
      id: "manage-cookies",
      title: "Cookie Consent Manager",
      body: (
        <>
          <p>
            Use our interactive Cookie Preference panel below to choose which categories of cookies you consent to.
            Essential cookies cannot be disabled as they are required to support basic site security and auth.
          </p>
          <CookiePreferences />
        </>
      ),
    },
    {
      id: "your-choices",
      title: "Your Choices & Control",
      body: (
        <p>
          In addition to using our Cookie Consent Manager above, you have the right to decide whether to accept or
          reject cookies. You can set or amend your web browser controls to accept or refuse cookies. If you choose to
          reject cookies, you may still use our website, though your access to some functionality (like authenticated
          dashboard areas) might be restricted.
        </p>
      ),
    },
    {
      id: "updates-policy",
      title: "Policy Updates",
      body: (
        <p>
          We may update this Cookies Policy from time to time in order to reflect, for example, changes to the cookies
          we use or for other operational, legal, or regulatory reasons. Please therefore re-visit this Cookies Policy
          regularly to stay informed about our use of cookies and related technologies.
        </p>
      ),
    },
    {
      id: "contact-us",
      title: "Contact Us",
      body: (
        <p>
          If you have any questions about our use of cookies or other technologies, please email us at{" "}
          <a href="mailto:hello@clipiro.com">hello@clipiro.com</a>.
        </p>
      ),
    },
  ],
};

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How Clipiro uses cookies and how to manage your preferences.",
};

export default function CookiesPage() {
  return <LegalPage {...doc} />;
}
