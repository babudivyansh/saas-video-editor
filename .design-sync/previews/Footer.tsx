import { Footer, XIcon } from "@clipiro/ui";

const logo = <span style={{ fontWeight: 800, fontSize: 20, color: "#335CFF" }}>Clipiro</span>;

export function Default() {
  return (
    <Footer
      logo={logo}
      tagline="Turn long videos into viral short-form content with AI clipping, captions, and one-click export."
      columns={[
        {
          title: "Product",
          links: [
            { label: "Features", href: "/#features" },
            { label: "Pricing", href: "/pricing" },
            { label: "How it works", href: "/#how-it-works" },
            { label: "Updates", href: "/blog" },
          ],
        },
        {
          title: "Company",
          links: [
            { label: "About", href: "/about" },
            { label: "Blog", href: "/blog" },
            { label: "Contact", href: "mailto:hello@clipiro.com" },
            { label: "Privacy Policy", href: "/privacy" },
          ],
        },
        {
          title: "AI Tools",
          links: [
            { label: "AI Voiceover", href: "/tools/ai-voiceover" },
            { label: "AI Image Generator", href: "/tools/ai-image-generator" },
            { label: "AI Video Generator (Veo3)", href: "/tools/veo3" },
            { label: "AI Vocal Remover", href: "/tools/vocal-remover" },
          ],
        },
      ]}
      socials={[{ icon: <XIcon className="h-4 w-4" />, label: "X (Twitter)", href: "#" }]}
      copyright="© 2026 Clipiro. All rights reserved."
      bottomLinks={[
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ]}
    />
  );
}
