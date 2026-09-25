import { useEffect, useRef } from "react";
import { FaqAccordion } from "@clipiro/ui";

const ITEMS = [
  {
    question: "How are credits counted?",
    answer: "Each tool costs a set number of credits per run — AutoClip, for example, charges per minute of source video. Failed generations are refunded automatically.",
  },
  {
    question: "Can I cancel my plan anytime?",
    answer: "Yes. You keep your plan's features until the end of the billing period, and unused purchased credits never expire.",
  },
  {
    question: "Which platforms can I publish to?",
    answer: "YouTube Shorts, Instagram Reels and TikTok, with scheduling from the Social Tracker.",
  },
];

// Pass { question, answer } items; each row toggles independently.
export const Collapsed = () => (
  <div className="max-w-xl">
    <FaqAccordion items={ITEMS} />
  </div>
);

// Preview-only: opens the first row through its own button so the card shows
// an answer, not just questions.
export const FirstOpen = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click(); }, []);
  return (
    <div ref={ref} className="max-w-xl">
      <FaqAccordion items={ITEMS} />
    </div>
  );
};
