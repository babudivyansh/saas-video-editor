// Renders every exported component once with minimal props via
// react-dom/server, asserting nothing throws at render time. Run with:
//   npx tsx scratch/smoke.tsx
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as UI from "../src/index";

const cases: Array<[string, React.ReactElement]> = [
  ["Button", <UI.Button key="1">Click</UI.Button>],
  ["Button loading", <UI.Button key="2" loading>Click</UI.Button>],
  ["Input", <UI.Input key="3" label="Email" placeholder="you@example.com" />],
  ["Input error", <UI.Input key="4" label="Email" error="Required" />],
  ["Textarea", <UI.Textarea key="5" label="Notes" />],
  ["Select", <UI.Select key="6" label="Plan" options={[{ value: "a", label: "A" }]} />],
  ["Checkbox", <UI.Checkbox key="7" label="Agree" />],
  ["Switch", <UI.Switch key="8" checked onChange={() => {}} label="Enabled" />],
  ["Badge", <UI.Badge key="9" tone="success">Active</UI.Badge>],
  ["Card", <UI.Card key="10">content</UI.Card>],
  ["Card highlighted", <UI.Card key="11" highlighted>content</UI.Card>],
  ["Modal closed", <UI.Modal key="12" open={false} onClose={() => {}}>content</UI.Modal>],
  ["Modal open", <UI.Modal key="13" open onClose={() => {}} title="Title">content</UI.Modal>],
  ["Tabs", <UI.Tabs key="14" items={[{ value: "a", label: "A" }]} value="a" onChange={() => {}} />],
  ["Tooltip", <UI.Tooltip key="15" content="Hi"><span>hover</span></UI.Tooltip>],
  ["Avatar", <UI.Avatar key="16" name="Ada Lovelace" />],
  ["Alert", <UI.Alert key="17" tone="warning" title="Heads up">body</UI.Alert>],
  ["Spinner", <UI.Spinner key="18" />],
  ["ProgressBar", <UI.ProgressBar key="19" value={40} />],
  ["PricingCard", (
    <UI.PricingCard
      key="20"
      name="Pro"
      price="₹1,799"
      subtitle="140 credits / month"
      features={["140 credits / month", "All AI tools"]}
      ctaLabel="Get Pro"
    />
  )],
  ["PricingCard highlighted", (
    <UI.PricingCard
      key="21"
      name="Pro"
      price="₹1,799"
      features={["140 credits / month"]}
      highlighted
      ctaLabel="Get Pro"
    />
  )],
  ["ToolCard", <UI.ToolCard key="22" name="AI Voiceover" engine="ElevenLabs TTS" cost={2} />],
  ["CreditBadge free", <UI.CreditBadge key="23" cost="free" />],
  ["CreditBadge veo3", <UI.CreditBadge key="24" cost={35} veo3 />],
  ["FAQAccordionItem", <UI.FAQAccordionItem key="25" question="Q?" answer="A." open={false} onToggle={() => {}} />],
  ["NavBar", <UI.NavBar key="26" logo={<span>Logo</span>} links={[{ label: "Pricing", href: "/pricing" }]} cta={{ label: "Start", href: "/" }} />],
  ["Footer", (
    <UI.Footer
      key="27"
      logo={<span>Logo</span>}
      columns={[{ title: "Product", links: [{ label: "Pricing", href: "/pricing" }] }]}
      copyright="© 2026 Clipiro"
    />
  )],
];

let failures = 0;
for (const [name, element] of cases) {
  try {
    renderToStaticMarkup(element);
    console.log(`OK   ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${name}:`, err);
  }
}

console.log(`\n${cases.length - failures}/${cases.length} passed`);
if (failures > 0) process.exit(1);
