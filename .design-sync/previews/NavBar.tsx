import { NavBar } from "@clipiro/ui";

const logo = <span style={{ fontWeight: 800, fontSize: 20, color: "#335CFF" }}>Clipiro</span>;

export function Default() {
  return (
    <NavBar
      logo={logo}
      links={[
        { label: "Pricing", href: "/pricing" },
        { label: "Blog", href: "/blog" },
        { label: "About", href: "/about" },
      ]}
      cta={{ label: "Start Free", href: "/signup" }}
    />
  );
}
