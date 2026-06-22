"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const SimpleEditorWorkspace = dynamic(
  () => import("@/app/components/simple-editor-v2/SimpleEditorWorkspace"),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen flex items-center justify-center" style={{ background: "#0A0A0F" }}>
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#7C3AED", borderTopColor: "transparent" }}
        />
      </div>
    ),
  }
);

export default function SimpleEditorPage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  return <SimpleEditorWorkspace projectId={projectId} />;
}
