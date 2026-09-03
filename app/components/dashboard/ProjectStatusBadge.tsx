export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", analyzing: "Analyzing", pending_review: "Awaiting review",
  rendering: "Rendering", completed: "Completed", failed: "Failed",
};

export function ProjectStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        status === "completed" ? "bg-tint-emerald text-green-700"
        : status === "failed" ? "bg-error/10 text-red-700"
        : "bg-tint-violet text-accent-violet"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
