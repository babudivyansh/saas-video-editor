export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", analyzing: "Analyzing", pending_review: "Awaiting review",
  rendering: "Rendering", completed: "Completed", failed: "Failed",
};

export function ProjectStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        status === "completed" ? "bg-green-50 text-green-700"
        : status === "failed" ? "bg-red-50 text-red-700"
        : "bg-blue-50 text-blue-700"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
