import * as React from "react";
import { cx } from "../../utils/cx";
import { ChevronDownIcon } from "../../icons";

export interface FAQAccordionItemProps {
  question: string;
  answer: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  className?: string;
}

/** Grid-rows collapse animation, matching the app's FAQ section. */
export function FAQAccordionItem({ question, answer, open, onToggle, className = "" }: FAQAccordionItemProps) {
  return (
    <div className={cx("rounded-xl border border-gray-100 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900", className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
      >
        <span className="font-semibold text-gray-900 dark:text-zinc-100">{question}</span>
        <ChevronDownIcon
          className={cx("h-4 w-4 flex-shrink-0 text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-4 text-sm text-gray-500 leading-relaxed dark:text-zinc-400">{answer}</p>
        </div>
      </div>
    </div>
  );
}
