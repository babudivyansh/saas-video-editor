"use client";

import { Suspense, use } from "react";
import { ToastProvider } from "@/app/components/ui/Toast";
import { ClipsView } from "../../clips/ClipsView";

// A collection's clips ("favorites" is every hearted clip), in the same view
// as a project's.
export default function CollectionClipsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ToastProvider>
      <Suspense>
        <ClipsView source={{ kind: "collection", id }} />
      </Suspense>
    </ToastProvider>
  );
}
