"use client";

import { Suspense, use } from "react";
import { ToastProvider } from "@/app/components/ui/Toast";
import { ClipsView } from "../clips/ClipsView";

// A project's clips: list or grid, Filter, Sort, and the clip editor.
export default function ProjectClipsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ToastProvider>
      {/* useSearchParams needs a Suspense boundary for the static shell. */}
      <Suspense>
        <ClipsView source={{ kind: "project", id }} />
      </Suspense>
    </ToastProvider>
  );
}
