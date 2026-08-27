// Transactional confirmations for a specific render finishing. Not opt-out
// gated — like purchase-confirmation, this is a direct reply to something the
// user just did, not an unsolicited nudge.

import type { EmailDocument } from "../layout";
import { greet, plural } from "../format";

export function clipsReady(p: { name: string; readyCount: number; href: string }): EmailDocument {
  const n = p.readyCount;
  return {
    subject: n > 0 ? `Your ${n} ${plural(n, "clip")} ${n === 1 ? "is" : "are"} ready` : "Your Auto Clip render finished",
    preheader: n > 0 ? `${n} ${plural(n, "clip")} finished rendering — take a look.` : "Your Auto Clips finished rendering.",
    blocks: [
      { kind: "heading", text: `${greet(p.name)}, your ${n > 0 ? `${n} ${plural(n, "clip")}` : "clips"} ${n === 1 ? "is" : "are"} ready` },
      {
        kind: "paragraph",
        text: n > 0
          ? `${n} ${plural(n, "clip")} finished rendering and ${n === 1 ? "is" : "are"} ready to review, download, or publish.`
          : "Your Auto Clip render finished. Take a look at the results.",
      },
      { kind: "button", href: p.href, label: "View your clips" },
    ],
  };
}
