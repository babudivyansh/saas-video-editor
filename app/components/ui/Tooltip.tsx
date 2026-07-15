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

// CSS-only hover tooltip — same convention already used by
// app/components/ToolsSidebar.tsx's nav-item labels, generalized into a
// reusable wrapper rather than a shared library dependency.
export function Tooltip({ content, children, position = "top" }: TooltipProps) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${POSITION[position]} px-2.5 py-1.5 text-xs font-medium text-white bg-ink rounded-lg opacity-0 group-hover:opacity-100 z-50 shadow-lg transition-opacity max-w-[240px] whitespace-normal text-center`}
      >
        {content}
      </span>
    </span>
  );
}
