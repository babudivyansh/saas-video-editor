import * as React from "react";
import { FAQAccordionItem } from "@clipiro/ui";

export function FAQList() {
  const [openQ, setOpenQ] = React.useState<string | null>("veo3");
  const items = [
    {
      id: "veo3",
      question: "What are Veo3 credits?",
      answer:
        "The Veo3 Video Pack gives a separate, Veo3-only credit pool that can only be spent on Veo3 AI video generation — not voiceovers, images, or other tools.",
    },
    {
      id: "rollover",
      question: "Do credits roll over?",
      answer:
        "Subscription credits refill each month and do not roll over. One-time credit packs never expire.",
    },
    {
      id: "refund",
      question: "What's your refund policy?",
      answer:
        "We offer a 3-day money-back guarantee on your first purchase if you have not used more than 5 credits.",
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
      {items.map((item) => (
        <FAQAccordionItem
          key={item.id}
          question={item.question}
          answer={item.answer}
          open={openQ === item.id}
          onToggle={() => setOpenQ(openQ === item.id ? null : item.id)}
        />
      ))}
    </div>
  );
}
