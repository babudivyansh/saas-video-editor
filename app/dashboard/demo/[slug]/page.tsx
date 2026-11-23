"use client";

import { Suspense, use } from "react";
import { ToastProvider } from "@/app/components/ui/Toast";
import { ClipsView } from "../../projects/clips/ClipsView";

// A demo project (lib/demo-projects.ts): an AutoClip run on a sample video,
// laid out exactly like a project's clips, read-only. Home's "Start from a
// demo project" cards open it.
export default function DemoProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <ToastProvider>
      {/* useSearchParams needs a Suspense boundary for the static shell. */}
      <Suspense>
        <ClipsView source={{ kind: "demo", id: slug }} />
      </Suspense>
    </ToastProvider>
  );
}
