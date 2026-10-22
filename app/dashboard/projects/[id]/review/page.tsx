"use client";

import { use } from "react";
import { ToastProvider } from "@/app/components/ui/Toast";
import { ReviewDeck } from "../../clips/ReviewDeck";

// Keep or skip a project's finished clips, one at a time (design C5).
export default function ProjectReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ToastProvider>
      <ReviewDeck projectId={id} />
    </ToastProvider>
  );
}
