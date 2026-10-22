"use client";

import { Suspense, use } from "react";
import { SharePanel } from "../../clips/SharePanel";

// Post or download the clips the user kept (design C6).
export default function ProjectSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    // useSearchParams needs a Suspense boundary for the static shell.
    <Suspense>
      <SharePanel projectId={id} />
    </Suspense>
  );
}
