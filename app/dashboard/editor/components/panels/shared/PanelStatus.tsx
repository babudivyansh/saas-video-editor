"use client";

// Collapses the loading/empty/error text pattern duplicated across every
// panel into one place; empty/error reuse the ui/ EmptyState primitive.

import React from "react";
import { Loader2 } from "lucide-react";
import { EmptyState } from "../../ui";

export default function PanelStatus({
  state,
  message,
  icon,
}: {
  state: "loading" | "empty" | "error";
  message: string;
  icon?: React.ReactNode;
}) {
  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 p-2 text-xs text-editor-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {message}
      </div>
    );
  }
  return <EmptyState icon={icon ?? <span />} message={message} />;
}
