import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Clipiro collects, uses, and protects your data.",
};

const sections = [
  { id: "information-collection", title: "Information Collection" },
  { id: "automated-collection", title: "Automated Information Collection" },
  { id: "cookies", title: "Cookies & Tracking Technologies" },
  { id: "use-of-information", title: "Use of Information" },
  { id: "sharing", title: "Sharing of Information" },
  { id: "third-party", title: "Third-Party Service Integrations" },
  { id: "social-accounts", title: "Linked Social Accounts" },
  { id: "security", title: "Security" },
  { id: "international", title: "International Transfers" },
  { id: "your-rights", title: "Your Rights" },
  { id: "children", title: "Children's Privacy" },
  { id: "changes", title: "Changes to This Policy" },
  { id: "contact", title: "Contact Us" },
];

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="June 28, 2026" sections={sections}>

      <div className="mb-8 p-6 bg-blue-50/50 rounded-2xl border border-[#E8EDFF] flex items-start gap-4">
        <div className="w-8 h-8 rounded-lg bg-[#335CFF]/10 text-[#335CFF] flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h4 className="text-sm font-bold text-gray-900">Privacy Highlights</h4>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            • <strong>Security First:</strong> Your passwords are encrypted with industry-standard bcrypt hashing.<br />
            • <strong>No Data Selling:</strong> We do not sell your personal data or video configurations.<br />
            • <strong>Secure Transactions:</strong> Billing is processed directly through Razorpay; we never handle your credit card data.
          </p>
        </div>
      </div>

      <p>
        Welcome to Clipiro (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). We are committed to protecting your personal
        information and your right to privacy. This Privacy Policy explains how we collect, use,
        disclose, and safeguard your information when you use our AI video generation platform
        at clipiro.ai (the &quot;Service&quot;). Please read this policy carefully. If you disagree
        with its terms, please discontinue use of the Service.
      </p>

      <h2 id="information-collection">Information Collection</h2>

      <h3>Information You Provide</h3>
      <p>We collect information that you voluntarily provide when you:</p>
      <ul>
        <li><strong>Create an account:</strong> name, email address, and password.</li>
        <li><strong>Make a purchase:</strong> billing details processed securely through Razorpay. We do not store your full card number or banking credentials.</li>
        <li><strong>Use the editor:</strong> video topics, scripts, voice preferences, background selections, and subtitle styles you input to generate content.</li>
        <li><strong>Contact support:</strong> messages, feedback, or inquiries you send to us.</li>
      </ul>

      <h3>Account Information</h3>
      <p>
        When you register, we store your email address, a hashed version of your password (we
        never store your plain-text password), your credit balance, and the projects you create.
        We use this data solely to operate and personalise your Clipiro experience.
      </p>

      <h2 id="automated-collection">Automated Information Collection</h2>
      <p>
        When you access our Service, we and our service providers may automatically collect
        certain technical information, including:
      </p>
      <ul>
        <li>IP address and approximate geographic location (country/city level)</li>
        <li>Browser type, version, and operating system</li>
        <li>Pages visited, features used, and time spent on the Service</li>
        <li>Referring URLs and exit pages</li>
        <li>Device identifiers and screen resolution</li>
        <li>Error logs and performance data</li>
      </ul>
      <p>
        This information helps us diagnose technical problems, analyse usage patterns, and
        improve the Service. It is not used to identify you personally without additional data.
      </p>

      <h2 id="cookies">Cookies & Tracking Technologies</h2>
      <p>
        We use cookies and similar technologies (web beacons, pixel tags, local storage) to
        operate the Service and improve your experience. The types we use include:
      </p>
      <ul>
        <li><strong>Strictly necessary cookies:</strong> Required for authentication and security (e.g., session tokens). You cannot opt out of these.</li>
        <li><strong>Functional cookies:</strong> Remember your preferences such as language and editor settings.</li>
        <li><strong>Analytics cookies:</strong> Help us understand how the Service is used in aggregate. We use privacy-respecting analytics tools that anonymise IP addresses.</li>
      </ul>
      <p>
        You can manage or delete cookies through your browser settings. Disabling certain
        cookies may affect the functionality of the Service.
      </p>

      <h2 id="use-of-information">Use of Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, operate, and maintain the Clipiro Service</li>
        <li>Process transactions and manage your credit balance</li>
        <li>Generate AI videos using the prompts and preferences you supply</li>
        <li>Send transactional emails (account confirmation, payment receipts, video completion notifications)</li>
        <li>Respond to your customer support requests</li>
        <li>Detect and prevent fraud, abuse, and security incidents</li>
        <li>Comply with applicable legal obligations</li>
        <li>Improve our AI models and Service features using aggregated, anonymised data</li>
        <li>Send optional product updates and promotional communications (you may opt out at any time)</li>
      </ul>
      <p>
        We do not sell your personal data to third parties. We do not use your video content
        or scripts to train our own AI models without your explicit consent.
      </p>

      <h2 id="sharing">Sharing of Information</h2>
      <h3>Service Providers</h3>
      <p>
        We share your information with trusted third-party vendors who perform services on our
        behalf, such as cloud hosting (AWS), payment processing (Razorpay), AI services
        (Google Gemini, ElevenLabs), and customer communications. These providers are
        contractually obligated to use your data only to provide their services to us and to
        maintain appropriate security measures.
      </p>

      <h3>Legal Obligations</h3>
      <p>
        We may disclose your information when required by law, subpoena, court order, or
        government authority, or where we believe disclosure is necessary to protect the rights,
        property, or safety of Clipiro, our users, or the public.
      </p>

      <h3>Protection of Rights and Safety</h3>
      <p>
        We may share information to investigate, prevent, or take action regarding suspected
        illegal activities, violations of our Terms of Service, fraud, or situations involving
        potential threats to the physical safety of any person.
      </p>

      <h3>Business Transfers</h3>
      <p>
        If Clipiro is acquired, merged with, or sells its assets to another company, your
        information may be transferred as part of that transaction. We will notify you via
        email or a prominent notice on the Service before your data is transferred and becomes
        subject to a different privacy policy.
      </p>

      <h2 id="third-party">Third-Party Service Integrations</h2>

      <h3>Google Gemini AI</h3>
      <p>
        We use Google&apos;s Gemini API to generate video scripts from your prompts. The text
        you enter as a video topic is sent to Google&apos;s servers for processing. Google&apos;s
        use of this data is governed by the{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
          Google Privacy Policy
        </a>. We do not send personally identifiable information to Gemini beyond your prompt text.
      </p>

      <h3>ElevenLabs</h3>
      <p>
        We use ElevenLabs to synthesise voiceovers from your scripts. Your script text is
        transmitted to ElevenLabs servers to generate audio. ElevenLabs&apos; data practices
        are governed by their own privacy policy. Audio is generated in real time and not
        stored by ElevenLabs on your behalf.
      </p>

      <h3>Amazon Web Services (AWS)</h3>
      <p>
        Videos, audio files, and assets are stored on AWS S3. AWS operates under its own
        security and privacy certifications (ISO 27001, SOC 2, etc.). Data stored in S3 is
        encrypted at rest and in transit.
      </p>

      <h3>Razorpay</h3>
      <p>
        Payment processing is handled by Razorpay. When you make a purchase, your payment
        details are submitted directly to Razorpay and are subject to their privacy policy.
        We only receive a transaction confirmation and the amount; we never see your full
        card or bank details.
      </p>

      <h2 id="social-accounts">Linked Social Accounts (Social Tracker)</h2>
      <p>
        If you use the Social Tracker, you may link your YouTube, Instagram, or Facebook
        accounts via each platform&apos;s official OAuth flow. We request{" "}
        <strong>read-only</strong> analytics permissions only — we cannot post, message, delete
        content, or read your direct messages or follower lists.
      </p>
      <ul>
        <li><strong>What we store:</strong> your public profile basics (name, username, avatar) and analytics figures (followers, views, reach, likes, comments, watch time), including periodic snapshots used to chart your growth.</li>
        <li><strong>Access tokens:</strong> the OAuth tokens the platforms issue are encrypted at rest with AES-256-GCM, stored only on our servers, and are never exposed to your browser or any third party.</li>
        <li><strong>YouTube:</strong> use of YouTube data complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including its Limited Use requirements. It is used only to show you your own analytics and is never sold or used for advertising.</li>
        <li><strong>Instagram &amp; Facebook:</strong> data obtained through the Meta Graph API is used solely to display your own insights, in accordance with Meta&apos;s Platform Terms.</li>
        <li><strong>Disconnecting:</strong> you can unlink any account at any time from the Social Tracker. Doing so revokes our access at the provider and deletes the stored tokens and analytics. Deleting your Clipiro account removes all linked-account data automatically.</li>
      </ul>

      <h2 id="security">Security</h2>
      <p>
        We implement industry-standard technical and organisational security measures to
        protect your personal information, including:</p>
      <ul>
        <li>HTTPS/TLS encryption for all data in transit</li>
        <li>AES-256 encryption for data at rest on AWS S3</li>
        <li>Bcrypt hashing for all stored passwords</li>
        <li>JWT-based authentication with short expiry and server-side session invalidation</li>
        <li>Role-based access controls limiting internal access to personal data</li>
        <li>Regular security reviews and dependency audits</li>
      </ul>
      <p>
        Despite these measures, no method of transmission over the internet or electronic
        storage is 100% secure. We cannot guarantee absolute security, and you use the
        Service at your own risk.
      </p>

      <h2 id="international">International Transfers</h2>
      <p>
        Clipiro is operated from India. If you access our Service from outside India, your
        information may be transferred to and processed in India or other countries where our
        service providers operate (including the United States for AWS and Google services).
        These countries may have data protection laws that differ from those in your jurisdiction.
        By using the Service, you consent to such transfers.
      </p>

      <h2 id="your-rights">Your Rights</h2>
      <p>Depending on your location, you may have the right to:</p>
      <ul>
        <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
        <li><strong>Correction:</strong> Request that we correct inaccurate or incomplete personal data.</li>
        <li><strong>Deletion:</strong> Request that we delete your account and associated personal data, subject to legal retention obligations.</li>
        <li><strong>Portability:</strong> Request your data in a structured, machine-readable format.</li>
        <li><strong>Opt-out of marketing:</strong> Unsubscribe from promotional emails at any time via the link in each email or by contacting us.</li>
        <li><strong>Withdraw consent:</strong> Where processing is based on consent, withdraw it at any time without affecting prior processing.</li>
      </ul>
      <p>
        To exercise any of these rights, email us at{" "}
        <a href="mailto:privacy@clipiro.ai">privacy@clipiro.ai</a>. We will respond within
        30 days. We may need to verify your identity before processing your request.
      </p>

      <h2 id="children">Children&apos;s Privacy</h2>
      <p>
        The Service is not directed to individuals under the age of 13 (or 16 in the European
        Economic Area). We do not knowingly collect personal information from children. If you
        believe a child has provided us with personal information, please contact us immediately
        and we will delete it.
      </p>

      <h2 id="changes">Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will revise the
        &quot;Last updated&quot; date at the top of this page and, for material changes, notify you
        via email or a prominent notice on the Service. Your continued use of the Service after
        any changes constitutes your acceptance of the updated policy.
      </p>

      <h2 id="contact">Contact Us</h2>
      <p>
        If you have questions, concerns, or requests regarding this Privacy Policy or our
        data practices, please contact us:
      </p>
      <ul>
        <li><strong>Email:</strong> <a href="mailto:privacy@clipiro.ai">privacy@clipiro.ai</a></li>
        <li><strong>Support:</strong> <a href="mailto:support@clipiro.ai">support@clipiro.ai</a></li>
      </ul>
      <p>We aim to respond to all privacy inquiries within 5 business days.</p>

    </LegalPage>
  );
}
