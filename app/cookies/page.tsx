import LegalPage from "../components/LegalPage";
import CookiePreferences from "./CookiePreferences";

const sections = [
  { id: "what-are-cookies", title: "What Are Cookies" },
  { id: "how-we-use", title: "How We Use Cookies" },
  { id: "types-of-cookies", title: "Types of Cookies We Use" },
  { id: "manage-cookies", title: "Cookie Consent Manager" },
  { id: "your-choices", title: "Your Choices & Control" },
  { id: "updates-policy", title: "Policy Updates" },
  { id: "contact-us", title: "Contact Us" },
];

export default function CookiesPage() {
  return (
    <LegalPage title="Cookies Policy" lastUpdated="June 28, 2026" sections={sections}>
      <p>
        This Cookies Policy explains how Clipiro (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) uses cookies and
        similar tracking technologies on our website. It outlines what these technologies are,
        why we use them, and your rights to control our use of them.
      </p>

      <h2 id="what-are-cookies">What Are Cookies</h2>
      <p>
        Cookies are small data files that are placed on your computer or mobile device when you
        visit a website. They are widely used by website owners to make their websites work, or
        to work more efficiently, as well as to provide reporting information.
      </p>
      <p>
        Cookies set by the website owner (in this case, Clipiro) are called &quot;first-party
        cookies&quot;. Cookies set by parties other than the website owner are called &quot;third-party
        cookies&quot;. Third-party cookies enable third-party features or functionality to be
        provided on or through the website (e.g., interactive content, payment processing, and analytics).
      </p>

      <h2 id="how-we-use">How We Use Cookies</h2>
      <p>
        We use first-party and third-party cookies for several reasons. Some cookies are required for
        technical reasons in order for our website and editor to operate, and we refer to these as
        &quot;essential&quot; or &quot;strictly necessary&quot; cookies. Other cookies enable us to track and
        target the interests of our users to enhance the experience on our Online Platform.
      </p>

      <h2 id="types-of-cookies">Types of Cookies We Use</h2>

      <h3>1. Strictly Necessary Cookies</h3>
      <p>
        These cookies are essential to provide you with services available through our Website and to
        use some of its features, such as secure login sessions.
      </p>
      <ul>
        <li><strong>Authentication:</strong> We use session cookies to keep you signed in while using the editor.</li>
        <li><strong>Security:</strong> CSRF protection cookies to prevent cross-site request forgery attacks.</li>
      </ul>

      <h3>2. Performance & Analytics Cookies</h3>
      <p>
        These cookies collect information that is used either in aggregate form to help us understand
        how our Website is being used or how effective our marketing campaigns are.
      </p>
      <ul>
        <li><strong>Traffic Analysis:</strong> We track unique visitors, bounce rates, and popular templates to optimize load times and simplify the creation flow.</li>
      </ul>

      <h3>3. Marketing & Advertising Cookies</h3>
      <p>
        These cookies are used to make advertising messages more relevant to you. They perform functions
        like preventing the same ad from continuously reappearing, ensuring that ads are properly displayed
        for advertisers, and selecting advertisements that are based on your interests.
      </p>

      <h2 id="manage-cookies">Cookie Consent Manager</h2>
      <p>
        Use our interactive Cookie Preference panel below to choose which categories of cookies you consent to.
        Essential cookies cannot be disabled as they are required to support basic site security and auth.
      </p>

      <CookiePreferences />

      <h2 id="your-choices">Your Choices & Control</h2>
      <p>
        In addition to using our Cookie Consent Manager above, you have the right to decide whether
        to accept or reject cookies. You can set or amend your web browser controls to accept or
        refuse cookies. If you choose to reject cookies, you may still use our website, though
        your access to some functionality (like authenticated dashboard areas) might be restricted.
      </p>

      <h2 id="updates-policy">Policy Updates</h2>
      <p>
        We may update this Cookies Policy from time to time in order to reflect, for example, changes
        to the cookies we use or for other operational, legal, or regulatory reasons. Please therefore
        re-visit this Cookies Policy regularly to stay informed about our use of cookies and related technologies.
      </p>

      <h2 id="contact-us">Contact Us</h2>
      <p>
        If you have any questions about our use of cookies or other technologies, please email us at{" "}
        <a href="mailto:privacy@clipiro.ai">privacy@clipiro.ai</a>.
      </p>
    </LegalPage>
  );
}
