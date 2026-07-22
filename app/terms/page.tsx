import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Clipiro's AI video clipping platform.",
};

const sections = [
  { id: "acceptance", title: "Acceptance of Terms" },
  { id: "eligibility", title: "Eligibility" },
  { id: "accounts", title: "Accounts & Registration" },
  { id: "service", title: "Description of Service" },
  { id: "credits", title: "Credits & Payments" },
  { id: "acceptable-use", title: "Acceptable Use" },
  { id: "prohibited", title: "Prohibited Activities" },
  { id: "ip", title: "Intellectual Property" },
  { id: "user-content", title: "Your Content" },
  { id: "ai-disclaimer", title: "AI-Generated Content Disclaimer" },
  { id: "third-party", title: "Third-Party Services" },
  { id: "termination", title: "Termination" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of Liability" },
  { id: "indemnification", title: "Indemnification" },
  { id: "governing-law", title: "Governing Law" },
  { id: "changes", title: "Changes to Terms" },
  { id: "contact", title: "Contact Us" },
];

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="June 14, 2026" sections={sections}>

      <div className="mb-8 p-6 bg-blue-50/50 rounded-2xl border border-[#E8EDFF] flex items-start gap-4">
        <div className="w-8 h-8 rounded-lg bg-[#335CFF]/10 text-[#335CFF] flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h4 className="text-sm font-bold text-gray-900">Terms of Service Highlights</h4>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            • <strong>Account Ownership:</strong> You own the videos you generate using our service.<br />
            • <strong>Acceptable Use:</strong> You agree not to use Clipiro to generate illegal, harmful, or defamatory content.<br />
            • <strong>Credit System:</strong> Credits are non-transferable and can be purchased in packages processed by Razorpay.
          </p>
        </div>
      </div>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Clipiro
        platform, website, and services (collectively, the &quot;Service&quot;) operated by Clipiro
        (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;). By creating an account or using the Service, you agree to be
        bound by these Terms. If you do not agree, do not use the Service.
      </p>

      <h2 id="acceptance">Acceptance of Terms</h2>
      <p>
        By accessing or using Clipiro, you confirm that you have read, understood, and
        agree to be bound by these Terms and our{" "}
        <a href="/privacy">Privacy Policy</a>, which is incorporated by reference.
        These Terms constitute a legally binding agreement between you and Clipiro.
      </p>

      <h2 id="eligibility">Eligibility</h2>
      <p>
        You must be at least 13 years of age (or 16 in the European Economic Area) to use
        the Service. By using the Service, you represent and warrant that you meet this
        age requirement and have the legal capacity to enter into these Terms. If you are
        using the Service on behalf of an organisation, you represent that you have authority
        to bind that organisation to these Terms.
      </p>

      <h2 id="accounts">Accounts & Registration</h2>
      <p>
        To access most features of the Service, you must register for an account. You agree to:
      </p>
      <ul>
        <li>Provide accurate, current, and complete information during registration</li>
        <li>Maintain and promptly update your account information</li>
        <li>Keep your password confidential and not share it with any third party</li>
        <li>Notify us immediately at <a href="mailto:support@clipiro.ai">support@clipiro.ai</a> of any unauthorised access to your account</li>
        <li>Accept responsibility for all activity that occurs under your account</li>
      </ul>
      <p>
        We reserve the right to suspend or terminate accounts that contain false information
        or that have been inactive for an extended period, following reasonable notice.
      </p>

      <h2 id="service">Description of Service</h2>
      <p>
        Clipiro is an AI-powered platform that enables users to generate short-form vertical
        videos from text prompts. The Service includes:
      </p>
      <ul>
        <li>AI script generation powered by Google Gemini</li>
        <li>AI voiceover synthesis via ElevenLabs</li>
        <li>Karaoke-style caption generation with word-level timing</li>
        <li>Background music and visual selection</li>
        <li>Video rendering and export in 9:16 vertical format</li>
        <li>Cloud storage for generated projects via AWS S3</li>
      </ul>
      <p>
        We reserve the right to modify, suspend, or discontinue any aspect of the Service
        at any time, with reasonable notice where practicable. We will not be liable to you
        for any modification, suspension, or discontinuation of the Service.
      </p>

      <h2 id="credits">Credits & Payments</h2>
      <h3>Credit System</h3>
      <p>
        The Service operates on a credit-based system. Each video generation consumes one
        credit. New accounts receive 30 free credits upon registration. Additional credits
        are available for purchase in the following packs:
      </p>
      <ul>
        <li><strong>Starter:</strong> 60 credits for ₹799</li>
        <li><strong>Pro:</strong> 180 credits for ₹1,599</li>
        <li><strong>Studio:</strong> 600 credits for ₹3,999</li>
      </ul>
      <p>
        Credits are non-transferable between accounts. Purchased credits do not expire,
        but free credits may expire after 90 days of account inactivity.
      </p>

      <h3>Payment Processing</h3>
      <p>
        All payments are processed securely by Razorpay. By making a purchase, you agree
        to Razorpay&apos;s terms and conditions. We reserve the right to change pricing at any
        time; price changes will not affect credits already purchased. All prices are in
        Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise.
      </p>

      <h3>Refunds</h3>
      <p>
        Refund eligibility is governed by our <a href="/refund">Refund Policy</a>.
        Purchases of credit packs are generally non-refundable once credits have been used.
      </p>

      <h2 id="acceptable-use">Acceptable Use</h2>
      <p>You agree to use the Service only for lawful purposes and in accordance with these Terms. You may:</p>
      <ul>
        <li>Generate videos for personal, educational, or commercial use within the bounds of these Terms</li>
        <li>Use generated videos on social media platforms (TikTok, YouTube, Instagram, etc.)</li>
        <li>Monetise generated content on platforms that permit AI-generated material</li>
      </ul>

      <h2 id="prohibited">Prohibited Activities</h2>
      <p>You must not use the Service to:</p>
      <ul>
        <li>Generate content that is defamatory, harassing, threatening, hateful, or discriminatory</li>
        <li>Create videos that infringe any third party&apos;s intellectual property, privacy, or publicity rights</li>
        <li>Generate deepfakes or synthetic media designed to deceive viewers about the identity of a real person</li>
        <li>Produce content that promotes illegal activities, violence, self-harm, or terrorism</li>
        <li>Generate sexually explicit content involving minors</li>
        <li>Spam, phish, or distribute malware through generated content</li>
        <li>Attempt to reverse-engineer, scrape, or extract data from the Service beyond normal use</li>
        <li>Use automated bots or scripts to access the Service in a manner that places unreasonable load on our infrastructure</li>
        <li>Resell access to the Service or credits without our prior written consent</li>
        <li>Circumvent any security measures, access controls, or rate limits</li>
      </ul>
      <p>
        Violation of these prohibitions may result in immediate account termination without
        refund, and we reserve the right to report illegal activity to appropriate authorities.
      </p>

      <h2 id="ip">Intellectual Property</h2>
      <h3>Our Property</h3>
      <p>
        The Service, including its software, design, branding, trademarks, and underlying
        AI infrastructure, is owned by Clipiro and protected by applicable intellectual
        property laws. You may not copy, modify, distribute, or create derivative works of
        any part of our platform without our express written permission.
      </p>

      <h3>Your Ownership of Generated Videos</h3>
      <p>
        Subject to these Terms, you own the videos you generate using the Service. You are
        responsible for ensuring your use of generated content complies with platform policies,
        applicable law, and any third-party rights. Clipiro does not claim ownership of
        your output.
      </p>

      <h2 id="user-content">Your Content</h2>
      <p>
        By submitting prompts, scripts, or other content to the Service, you grant Clipiro
        a limited, non-exclusive, worldwide licence to process and use that content solely
        to provide the Service to you. We do not use your prompts or generated videos to
        train our AI models without your explicit consent.
      </p>
      <p>
        You represent and warrant that you own or have the necessary rights to any content
        you submit, and that your content does not violate any third-party rights or applicable law.
      </p>

      <h2 id="ai-disclaimer">AI-Generated Content Disclaimer</h2>
      <p>
        Clipiro uses artificial intelligence to generate scripts, voiceovers, and video
        content. AI-generated content may occasionally be inaccurate, incomplete, or
        inappropriate. You are solely responsible for reviewing generated content before
        publishing it. Clipiro does not guarantee the accuracy, completeness, suitability,
        or factual correctness of any AI-generated output.
      </p>

      <h2 id="third-party">Third-Party Services</h2>
      <p>
        The Service integrates with third-party providers including Google (Gemini AI),
        ElevenLabs, AWS, and Razorpay. Your use of these integrated services is also subject
        to their respective terms and privacy policies. We are not responsible for the
        availability, accuracy, or practices of third-party services.
      </p>

      <h2 id="termination">Termination</h2>
      <p>
        We may suspend or terminate your account and access to the Service at any time,
        with or without cause, with or without notice, if we believe you have violated these
        Terms. You may terminate your account at any time by contacting{" "}
        <a href="mailto:support@clipiro.ai">support@clipiro.ai</a>.
      </p>
      <p>
        Upon termination, your right to use the Service ceases immediately. Unused purchased
        credits at the time of termination for cause are non-refundable. Sections of these
        Terms that by their nature should survive termination will do so, including
        intellectual property, disclaimers, limitation of liability, and governing law.
      </p>

      <h2 id="disclaimers">Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
        EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR UNINTERRUPTED ACCESS.
        WE DO NOT WARRANT THAT THE SERVICE WILL MEET YOUR REQUIREMENTS, BE ERROR-FREE, OR
        THAT DEFECTS WILL BE CORRECTED.
      </p>

      <h2 id="liability">Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CLIPIRO AND ITS OFFICERS,
        DIRECTORS, EMPLOYEES, AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR
        GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE,
        EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
      </p>
      <p>
        OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATING TO
        THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID TO CLIPIRO IN THE 12 MONTHS
        PRECEDING THE CLAIM, OR ₹1,000 (ONE THOUSAND RUPEES), WHICHEVER IS GREATER.
      </p>

      <h2 id="indemnification">Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless Clipiro and its officers, directors,
        employees, and agents from and against any claims, liabilities, damages, losses, and
        expenses (including reasonable legal fees) arising out of or relating to: (a) your use
        of the Service; (b) your violation of these Terms; (c) your violation of any third-party
        rights; or (d) any content you submit or generate through the Service.
      </p>

      <h2 id="governing-law">Governing Law & Disputes</h2>
      <p>
        These Terms are governed by and construed in accordance with the laws of India,
        without regard to its conflict of law provisions. Any dispute arising from these Terms
        or your use of the Service shall be subject to the exclusive jurisdiction of the courts
        located in India. You agree to first attempt to resolve disputes informally by
        contacting us at <a href="mailto:legal@clipiro.ai">legal@clipiro.ai</a> before
        initiating any formal legal proceedings.
      </p>

      <h2 id="changes">Changes to Terms</h2>
      <p>
        We reserve the right to modify these Terms at any time. When we make material changes,
        we will notify you via email or a prominent notice on the Service at least 14 days
        before the changes take effect. Your continued use of the Service after the effective
        date constitutes your acceptance of the revised Terms. If you do not agree to the
        revised Terms, you must stop using the Service.
      </p>

      <h2 id="contact">Contact Us</h2>
      <p>If you have questions about these Terms, please contact us:</p>
      <ul>
        <li><strong>Email:</strong> <a href="mailto:legal@clipiro.ai">legal@clipiro.ai</a></li>
        <li><strong>Support:</strong> <a href="mailto:support@clipiro.ai">support@clipiro.ai</a></li>
      </ul>

    </LegalPage>
  );
}
