import type { Metadata } from "next";
import LegalPage from "@/app/components/LegalPage";
import { getLegalDoc } from "@/app/legal/documents";
import type { LegalDoc } from "@/app/legal/types";

// How to delete a Clipiro account without the app: Google Play requires a
// public page for this (docs/mobile/RELEASE.md B2). The steps mirror the
// real flows: app/api/account/deactivate (30-day grace, then purge) and the
// app's You → Settings → Delete account.

const doc: LegalDoc = {
  ...getLegalDoc("/delete-account"),
  intro: (
    <p>
      You can delete your Clipiro account at any time. Your account is switched off at once, and after 30 days it is
      deleted for good, along with your projects, clips, assets, posts, and connected-account data, unless you sign
      back in before then. Any paid plan is cancelled.
    </p>
  ),
  sections: [
    {
      id: "in-the-app",
      title: "In the Android app",
      body: (
        <p>
          Go to <strong>You → Settings → Delete account</strong> and confirm with your password. If you signed up with
          Google, we email you a code to confirm with instead.
        </p>
      ),
    },
    {
      id: "on-the-web",
      title: "On the web",
      body: (
        <p>
          Sign in at clipiro.com, open <strong>Settings → Danger zone → Delete account</strong>, and confirm.
        </p>
      ),
    },
    {
      id: "by-email",
      title: "If you can't sign in",
      body: (
        <p>
          Email <a href="mailto:support@clipiro.com">support@clipiro.com</a> from your account’s email address and
          ask us to delete it. We’ll confirm it’s you and delete it for you.
        </p>
      ),
    },
    {
      id: "what-happens",
      title: "What happens to your data",
      body: (
        <ul>
          <li>
            <strong>Straight away:</strong> you’re signed out everywhere, you can’t sign in without
            reactivating, and any paid plan is cancelled.
          </li>
          <li>
            <strong>After 30 days:</strong> your account and everything in it are deleted for good: projects, clips,
            uploads and generated files, voices, posts, AI Assistant chats, and the data from accounts you connected.
          </li>
          <li>
            <strong>If you’ve ever bought a plan or credits:</strong> the law requires us to keep your invoices
            and payment records, including the billing name, email, and address printed on them. Everything else is
            still deleted automatically after the 30 days, and what remains of your account can’t be signed in to.
            See the <a href="/privacy">Privacy Policy</a>.
          </li>
          <li>
            <strong>Posts already published</strong> to YouTube, Instagram, or Facebook stay there: delete them on those
            platforms.
          </li>
        </ul>
      ),
    },
  ],
};

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: doc.slug },
};

export default function DeleteAccountPage() {
  return <LegalPage {...doc} />;
}
