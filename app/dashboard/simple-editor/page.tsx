"use client";

import dynamic from "next/dynamic";

const SimpleEditorUpload = dynamic(
  () => import("@/app/components/simple-editor-v2/SimpleEditorUpload"),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#7C3AED", borderTopColor: "transparent" }} />
      </div>
    ),
  }
);

export default function SimpleEditorPage() {
  return <SimpleEditorUpload />;
}
