"use client";

import { useId } from "react";

type TooltipPosition = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: TooltipPosition;
}

const POSITION: Record<TooltipPosition, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

// CSS-only tooltip — same convention already used by
// app/components/ToolsSidebar.tsx's nav-item labels, generalized into a
// reusable wrapper rather than a shared library dependency. Shows on hover
// AND keyboard focus (focus-within), and links the trigger to the tooltip
// text via aria-describedby for screen readers.
export function Tooltip({ content, children, position = "top" }: TooltipProps) {
  const id = useId();
  return (
    <span className="relative inline-flex group" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute ${POSITION[position]} block w-56 max-w-[calc(100vw-2rem)] px-2.5 py-1.5 text-xs font-medium text-white bg-ink rounded-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 z-50 shadow-lg transition-opacity text-center`}
      >
        {content}
      </span>
    </span>
  );
}
